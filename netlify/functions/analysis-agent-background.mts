import type { Config } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';
import { getStore } from '@netlify/blobs';
import { ANALYSIS_SYSTEM_PROMPT } from './_shared/analysisPrompt.js';
import { updateSessionReport, incrementUserSessionCount } from './_shared/db.js';
import type { AnalysisJobRequest, AnalysisJobStatus } from './_shared/types.js';

export const config: Config = { background: true };

export default async (req: Request) => {
  const body: AnalysisJobRequest = await req.json();
  const { submission, jobId, userId, messages } = body;

  const store = getStore('analysis-reports');

  const setStatus = async (s: AnalysisJobStatus) => {
    await store.set(jobId, JSON.stringify(s));
  };

  await setStatus({ status: 'pending', startedAt: Date.now() });

  try {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const userPrompt = `## Prompt to Analyze
\`\`\`
${submission.prompt_text}
\`\`\`

## Context
- **Target Model:** ${submission.model_target ?? 'general'}
- **Use Case:** ${submission.use_case ?? 'not specified'}
- **Desired Output:** ${submission.desired_output ?? 'not specified'}
- **Constraints:** ${submission.constraints ?? 'none specified'}
- **Additional Context:** ${submission.additional_context ?? 'none'}

${messages && messages.length > 0 ? `## Conversation Context\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}` : ''}

Please provide your comprehensive prompt analysis report.`;

    let accumulated = '';
    let lastFlush = Date.now();

    const stream = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: ANALYSIS_SYSTEM_PROMPT,
        maxOutputTokens: 16384,
      },
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        accumulated += chunk.text;
        if (Date.now() - lastFlush > 2000) {
          await setStatus({ status: 'streaming', partial: accumulated, startedAt: Date.now() });
          lastFlush = Date.now();
        }
      }
    }

    await setStatus({
      status: 'complete',
      report: accumulated,
      completedAt: Date.now(),
    });

    // Save to DB
    await updateSessionReport(jobId, accumulated, 'complete');
    if (userId) await incrementUserSessionCount(userId);

  } catch (err) {
    console.error('Analysis agent error:', err);
    await setStatus({
      status: 'error',
      error: String(err),
      failedAt: Date.now(),
    });
    await updateSessionReport(jobId, '', 'error', String(err));
  }
};
