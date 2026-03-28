import type { Config } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';
import { PROMPT_DESIGN_SYSTEM_PROMPT, PROMPT_REVISION_SYSTEM_PROMPT } from './_shared/promptDesignPrompt.js';
import { PROMPT_TESTER_SYSTEM_PROMPT } from './_shared/promptTesterPrompt.js';
import { PROMPT_ENGINEER_SYSTEM_PROMPT } from './_shared/promptEngineerPrompt.js';
import { TEST_INPUT_GENERATOR_PROMPT } from './_shared/testInputPrompt.js';
import { supabase, updateSessionReport, incrementUserSessionCount, saveReportData } from './_shared/supabase.js';
import { requireAuthOrEmbed } from './_shared/auth.js';
import { enforceAccess, trackUsage, trackTokens } from './_shared/access.js';
import { extractGeminiTokens } from '@boriskulakhmetov-aidigital/design-system/utils';
import type { PipelineJobRequest, PipelineJobStatus } from './_shared/types.js';
import { log } from './_shared/logger.js';

export const config: Config = { background: true };

export default async (req: Request) => {
  let authEmail: string | null = null;
  try {
    const auth = await requireAuthOrEmbed(req);
    authEmail = auth.email;
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  const body: PipelineJobRequest = await req.json();
  const { submission, jobId, userId, messages } = body;
  const userEmail = authEmail ?? body.userEmail ?? undefined;

  const iteration = submission.iteration ?? 1;
  const isRefinement = !!submission.refinement_request && !!submission.base_prompt;

  // Read existing meta to preserve session_id, source, key_id from api-submit
  const { data: existingJob } = await supabase.from('job_status')
    .select('meta').eq('id', jobId).maybeSingle();
  const baseMeta = (existingJob?.meta as Record<string, unknown>) ?? {};

  const setStatus = async (s: PipelineJobStatus) => {
    await supabase.from('job_status').upsert({
      id: jobId,
      app: 'prompt-engineering',
      status: s.status,
      partial_text: s.stage ?? null,
      report: s.report ?? null,
      error: s.error ?? null,
      meta: {
        ...baseMeta,
        iteration,
        designedPrompt: s.designedPrompt,
        testResults: s.testResults,
        engineeredPrompt: s.engineeredPrompt,
      },
      updated_at: new Date().toISOString(),
      ...(s.startedAt ? { started_at: new Date(s.startedAt).toISOString() } : {}),
      ...(s.completedAt ? { completed_at: new Date(s.completedAt).toISOString() } : {}),
    });
  };

  await setStatus({ status: 'pending', stage: 'Initializing pipeline...', startedAt: Date.now() });

  // ── Tier-based access control ──────────────────────────────────────────────
  if (userId && !userId.startsWith('api:')) {
    const access = await enforceAccess(userId, 'prompt-engineering');
    if (!access.allowed) {
      await setStatus({ status: 'error', error: access.reason ?? 'Access denied', failedAt: Date.now() });
      await updateSessionReport(jobId, '', 'error', access.reason ?? 'Access denied');
      return;
    }
  }

  const ai_model = 'gemini-3.1-pro-preview';
  const startTime = Date.now();
  log.info('pipeline.start', { function_name: 'pipeline-runner-background', entity_type: 'session', entity_id: jobId, user_id: userId, user_email: userEmail, correlation_id: jobId, ai_provider: 'gemini', ai_model });

  try {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Accumulate token usage across all Gemini calls
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalAllTokens = 0;
    const accumulateTokens = (result: any) => {
      const t = extractGeminiTokens(result);
      totalInputTokens += t.inputTokens;
      totalOutputTokens += t.outputTokens;
      totalAllTokens += t.totalTokens;
    };

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
        model: 'gemini-3.1-pro-preview',
        contents: [{ role: 'user', parts: [{ text: revisionInput }] }],
        config: {
          systemInstruction: PROMPT_REVISION_SYSTEM_PROMPT,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingLevel: 'medium' },
        },
      });

      accumulateTokens(revisionResult);
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
        model: 'gemini-3.1-pro-preview',
        contents: [{ role: 'user', parts: [{ text: designInput }] }],
        config: {
          systemInstruction: PROMPT_DESIGN_SYSTEM_PROMPT,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingLevel: 'medium' },
        },
      });

      accumulateTokens(designResult);
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

    // ── Stage 2a: Generate realistic test input for the prompt ─────────
    await setStatus({
      status: 'testing',
      stage: 'Generating realistic test input...',
      designedPrompt: (isRefinement || submission.needs_design) ? workingPrompt : undefined,
      startedAt: Date.now(),
    });

    const inputGenResult = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: `Here is the prompt that needs test input:\n\n\`\`\`\n${workingPrompt}\n\`\`\`\n\nGenerate a realistic, representative sample input for this prompt.` }] }],
      config: {
        systemInstruction: TEST_INPUT_GENERATOR_PROMPT,
        maxOutputTokens: 4096,
      },
    });

    accumulateTokens(inputGenResult);
    const testInput = inputGenResult.text?.trim() ?? '';
    if (!testInput) throw new Error('Test input generator produced empty output');

    // ── Stage 2b: Prompt Tester — 3 parallel runs with same input ────
    await setStatus({
      status: 'testing',
      stage: 'Running prompt 3 times in parallel with test input...',
      designedPrompt: (isRefinement || submission.needs_design) ? workingPrompt : undefined,
      startedAt: Date.now(),
    });

    // Build the test message: prompt as system instruction, test input as user message
    const testRun = () =>
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: testInput }] }],
        config: {
          systemInstruction: workingPrompt,
          maxOutputTokens: 4096,
        },
      });

    const [run1, run2, run3] = await Promise.all([testRun(), testRun(), testRun()]);
    accumulateTokens(run1);
    accumulateTokens(run2);
    accumulateTokens(run3);

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

## Test Input Used
The following realistic sample input was generated and fed to all 3 test runs:
\`\`\`
${testInput}
\`\`\`

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

    const engineerResult = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [{ text: engineerInput }] }],
      config: {
        systemInstruction: PROMPT_ENGINEER_SYSTEM_PROMPT,
        maxOutputTokens: 16384,
        thinkingConfig: { thinkingLevel: 'medium' },
      },
    });

    accumulateTokens(engineerResult);
    const accumulated = engineerResult.text?.trim() ?? '';
    if (!accumulated) throw new Error('PromptEngineer produced empty output');

    // ── Extract engineered prompt from the output ─────────────────────────
    const engineeredPrompt = extractEngineeredPrompt(accumulated);

    // ── Complete ──────────────────────────────────────────────────────────
    const finalReport = buildFinalReport(workingPrompt, isRefinement, submission.needs_design, submission.refinement_request, testInput, testResults, accumulated, iteration);

    await setStatus({
      status: 'complete',
      designedPrompt: (isRefinement || submission.needs_design) ? workingPrompt : undefined,
      testResults,
      report: finalReport,
      engineeredPrompt,
      completedAt: Date.now(),
    });

    await updateSessionReport(jobId, finalReport, 'complete');

    // Save structured report_data for visual micro-report
    const reportData = {
      version: '1.0',
      iteration,
      isRefinement,
      wasDesigned: submission.needs_design ?? false,
      refinementRequest: submission.refinement_request || null,
      workingPrompt,
      testInput,
      testResults,
      engineerAnalysis: accumulated,
      engineeredPrompt,
      summary: {
        promptLength: workingPrompt.length,
        engineeredPromptLength: engineeredPrompt.length,
        testRunCount: testResults.length,
        avgTestResultLength: Math.round(testResults.reduce((sum, r) => sum + r.length, 0) / testResults.length),
        hasDesignPhase: submission.needs_design ?? false,
        model: ai_model,
      },
    };
    await saveReportData(jobId, reportData);

    if (userId && !isRefinement) await incrementUserSessionCount(userId);
    if (userId) await trackUsage(userId, 'prompt-engineering').catch(err => console.warn('trackUsage failed:', err));
    if (userId) trackTokens(userId, 'prompt-engineering', 'gemini', ai_model, totalInputTokens, totalOutputTokens, totalAllTokens);

    const duration_ms = Date.now() - startTime;
    log.info('pipeline.complete', { function_name: 'pipeline-runner-background', entity_type: 'session', entity_id: jobId, user_id: userId, user_email: userEmail, correlation_id: jobId, ai_provider: 'gemini', ai_model, duration_ms, ai_input_tokens: totalInputTokens, ai_output_tokens: totalOutputTokens, ai_total_tokens: totalAllTokens });

  } catch (err) {
    console.error('Pipeline runner error:', err);
    const duration_ms = Date.now() - startTime;
    log.error('pipeline.error', { function_name: 'pipeline-runner-background', entity_type: 'session', entity_id: jobId, user_id: userId, user_email: userEmail, correlation_id: jobId, error: err, error_category: 'gemini_api', duration_ms });
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
  testInput: string,
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

  report += `## Generated Test Input\n\nA realistic sample input was generated and used for all 3 test runs:\n\n<details>\n<summary><strong>View test input</strong></summary>\n\n${testInput}\n\n</details>\n\n---\n\n`;

  report += `## Test Run Results\n\nThe prompt was executed 3 times with the same test input to evaluate consistency:\n\n`;
  testResults.forEach((result, i) => {
    report += `<details>\n<summary><strong>Test Run ${i + 1}</strong></summary>\n\n${result}\n\n</details>\n\n`;
  });

  report += `---\n\n`;
  report += engineerAnalysis;

  return report;
}
