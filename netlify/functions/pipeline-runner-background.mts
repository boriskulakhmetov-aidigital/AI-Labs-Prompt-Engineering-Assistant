import type { Config } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';
import { getStore } from '@netlify/blobs';
import { PROMPT_DESIGN_SYSTEM_PROMPT, PROMPT_REVISION_SYSTEM_PROMPT } from './_shared/promptDesignPrompt.js';
import { PROMPT_TESTER_SYSTEM_PROMPT } from './_shared/promptTesterPrompt.js';
import { PROMPT_ENGINEER_SYSTEM_PROMPT } from './_shared/promptEngineerPrompt.js';
import { updateSessionReport, incrementUserSessionCount } from './_shared/db.js';
import type { PipelineJobRequest, PipelineJobStatus } from './_shared/types.js';

export const config: Config = { background: true };

export default async (req: Request) => {
  const body: PipelineJobRequest = await req.json();
  const { submission, jobId, userId, messages } = body;

  const store = getStore('analysis-reports');
  const iteration = submission.iteration ?? 1;
  const isRefinement = !!submission.refinement_request && !!submission.base_prompt;

  const setStatus = async (s: PipelineJobStatus) => {
    await store.set(jobId, JSON.stringify({ ...s, iteration }));
  };

  await setStatus({ status: 'pending', stage: 'Initializing pipeline...', startedAt: Date.now() });

  try {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ── Stage 1: Get the working prompt ──────────────────────────────────
    let workingPrompt: string;

    if (isRefinement) {
      // Refinement mode: revise the existing prompt based on user feedback
      await setStatus({ status: 'revising', stage: 'Revising prompt based on your feedback...', startedAt: Date.now() });

      const revisionInput = `## Current Prompt
\`\`\`
${submission.base_prompt}
\`\`\`

## User's Revision Request
${submission.refinement_request}

Revise the prompt to incorporate the requested changes.`;

      const revisionResult = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [{ role: 'user', parts: [{ text: revisionInput }] }],
        config: {
          systemInstruction: PROMPT_REVISION_SYSTEM_PROMPT,
          maxOutputTokens: 4096,
        },
      });

      workingPrompt = revisionResult.text?.trim() ?? '';
      if (!workingPrompt) throw new Error('PromptDesign revision produced empty output');

      await setStatus({
        status: 'revising',
        stage: 'Prompt revised. Starting test runs...',
        designedPrompt: workingPrompt,
        startedAt: Date.now(),
      });

    } else if (submission.needs_design) {
      // Design mode: build prompt from idea
      await setStatus({ status: 'designing', stage: 'Designing prompt from your idea...', startedAt: Date.now() });

      const designInput = `## User's Idea
${submission.prompt_idea}

## Context
- **Target Model:** ${submission.model_target ?? 'general'}
- **Use Case:** ${submission.use_case ?? 'not specified'}
- **Desired Output:** ${submission.desired_output ?? 'not specified'}
- **Constraints:** ${submission.constraints ?? 'none specified'}
- **Additional Context:** ${submission.additional_context ?? 'none'}

${messages && messages.length > 0 ? `## Conversation Context\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}` : ''}

Design a complete, production-ready prompt based on this idea.`;

      const designResult = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [{ role: 'user', parts: [{ text: designInput }] }],
        config: {
          systemInstruction: PROMPT_DESIGN_SYSTEM_PROMPT,
          maxOutputTokens: 4096,
        },
      });

      workingPrompt = designResult.text?.trim() ?? '';
      if (!workingPrompt) throw new Error('PromptDesign agent produced empty output');

      await setStatus({
        status: 'designing',
        stage: 'Prompt designed. Starting test runs...',
        designedPrompt: workingPrompt,
        startedAt: Date.now(),
      });
    } else {
      // Direct mode: use the user's prompt as-is
      workingPrompt = submission.prompt_text ?? '';
      if (!workingPrompt) throw new Error('No prompt text provided');
    }

    // ── Stage 2: Prompt Tester — 3 parallel runs ──────────────────────────
    await setStatus({
      status: 'testing',
      stage: 'Running prompt 3 times in parallel...',
      designedPrompt: (isRefinement || submission.needs_design) ? workingPrompt : undefined,
      startedAt: Date.now(),
    });

    const testRun = (runId: number) =>
      ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [{ role: 'user', parts: [{ text: workingPrompt }] }],
        config: {
          systemInstruction: PROMPT_TESTER_SYSTEM_PROMPT,
          maxOutputTokens: 4096,
          temperature: 0.9 + (runId * 0.05),
        },
      });

    const [run1, run2, run3] = await Promise.all([testRun(0), testRun(1), testRun(2)]);

    const testResults = [
      run1.text?.trim() ?? '[empty output]',
      run2.text?.trim() ?? '[empty output]',
      run3.text?.trim() ?? '[empty output]',
    ];

    await setStatus({
      status: 'testing',
      stage: 'Test runs complete. Analyzing results...',
      designedPrompt: (isRefinement || submission.needs_design) ? workingPrompt : undefined,
      testResults,
      startedAt: Date.now(),
    });

    // ── Stage 3: Prompt Engineer — analyze and rewrite ────────────────────
    await setStatus({
      status: 'engineering',
      stage: 'Engineering improved prompt...',
      designedPrompt: (isRefinement || submission.needs_design) ? workingPrompt : undefined,
      testResults,
      startedAt: Date.now(),
    });

    const promptOrigin = isRefinement
      ? `Revised from a previous iteration based on user feedback: "${submission.refinement_request}"`
      : submission.needs_design
        ? 'Designed from a user idea by our PromptDesign agent'
        : 'Provided directly by the user';

    const engineerInput = `## Original Prompt
\`\`\`
${workingPrompt}
\`\`\`

## Context
- **This prompt was:** ${promptOrigin}
- **Iteration:** ${iteration}
- **Target Model:** ${submission.model_target ?? 'general'}
- **Use Case:** ${submission.use_case ?? 'not specified'}
- **Desired Output:** ${submission.desired_output ?? 'not specified'}
- **Constraints:** ${submission.constraints ?? 'none specified'}

## Test Run 1 Output
\`\`\`
${testResults[0]}
\`\`\`

## Test Run 2 Output
\`\`\`
${testResults[1]}
\`\`\`

## Test Run 3 Output
\`\`\`
${testResults[2]}
\`\`\`

Analyze the prompt's performance across these three test runs and produce your synthesis of proposed changes plus the full re-engineered prompt.`;

    let accumulated = '';
    let lastFlush = Date.now();

    const engineerStream = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: engineerInput }] }],
      config: {
        systemInstruction: PROMPT_ENGINEER_SYSTEM_PROMPT,
        maxOutputTokens: 16384,
      },
    });

    for await (const chunk of engineerStream) {
      if (chunk.text) {
        accumulated += chunk.text;
        if (Date.now() - lastFlush > 2000) {
          await setStatus({
            status: 'engineering',
            stage: 'Engineering improved prompt...',
            designedPrompt: (isRefinement || submission.needs_design) ? workingPrompt : undefined,
            testResults,
            partial: accumulated,
            startedAt: Date.now(),
          });
          lastFlush = Date.now();
        }
      }
    }

    // ── Extract engineered prompt from the output ─────────────────────────
    const engineeredPrompt = extractEngineeredPrompt(accumulated);

    // ── Complete ──────────────────────────────────────────────────────────
    const finalReport = buildFinalReport(workingPrompt, isRefinement, submission.needs_design, submission.refinement_request, testResults, accumulated, iteration);

    await setStatus({
      status: 'complete',
      designedPrompt: (isRefinement || submission.needs_design) ? workingPrompt : undefined,
      testResults,
      report: finalReport,
      engineeredPrompt,
      completedAt: Date.now(),
    });

    await updateSessionReport(jobId, finalReport, 'complete');
    if (userId && !isRefinement) await incrementUserSessionCount(userId);

  } catch (err) {
    console.error('Pipeline runner error:', err);
    await setStatus({
      status: 'error',
      error: String(err),
      failedAt: Date.now(),
    });
    await updateSessionReport(jobId, '', 'error', String(err));
  }
};

function extractEngineeredPrompt(engineerOutput: string): string {
  // Try to extract the prompt from within ```...``` after "## Re-Engineered Prompt"
  const reEngSection = engineerOutput.split(/## Re-Engineered Prompt/i)[1];
  if (reEngSection) {
    const codeBlockMatch = reEngSection.match(/```[\s\S]*?\n([\s\S]*?)```/);
    if (codeBlockMatch) return codeBlockMatch[1].trim();
  }
  // Fallback: try to find any large code block in the second half
  const secondHalf = engineerOutput.slice(engineerOutput.length / 2);
  const fallback = secondHalf.match(/```[\s\S]*?\n([\s\S]*?)```/);
  if (fallback && fallback[1].trim().length > 50) return fallback[1].trim();
  return '';
}

function buildFinalReport(
  workingPrompt: string,
  isRefinement: boolean,
  wasDesigned: boolean,
  refinementRequest: string | undefined,
  testResults: string[],
  engineerAnalysis: string,
  iteration: number
): string {
  let report = '';

  if (iteration > 1) {
    report += `> **Iteration ${iteration}** — Refinement requested: "${refinementRequest}"\n\n---\n\n`;
  }

  if (isRefinement) {
    report += `## Revised Prompt (Iteration ${iteration})\n\nThe prompt was revised based on your feedback:\n\n\`\`\`\n${workingPrompt}\n\`\`\`\n\n---\n\n`;
  } else if (wasDesigned) {
    report += `## Designed Prompt\n\nOur PromptDesign engine created the following prompt from your idea:\n\n\`\`\`\n${workingPrompt}\n\`\`\`\n\n---\n\n`;
  } else {
    report += `## Original Prompt\n\n\`\`\`\n${workingPrompt}\n\`\`\`\n\n---\n\n`;
  }

  report += `## Test Run Results\n\nThe prompt was executed 3 times to evaluate consistency and identify issues:\n\n`;
  testResults.forEach((result, i) => {
    report += `<details>\n<summary><strong>Test Run ${i + 1}</strong></summary>\n\n${result}\n\n</details>\n\n`;
  });

  report += `---\n\n`;
  report += engineerAnalysis;

  return report;
}
