import { GoogleGenAI } from '@google/genai';
import { ORCHESTRATOR_SYSTEM_PROMPT } from './_shared/orchestratorPrompt.js';

const DISPATCH_ANALYSIS_TOOL = {
  name: 'dispatch_analysis',
  description: 'Dispatch the prompt analysis once enough intake information has been collected.',
  parameters: {
    type: 'OBJECT' as const,
    properties: {
      prompt_text: {
        type: 'STRING' as const,
        description: 'The prompt text to analyze and optimize',
      },
      model_target: {
        type: 'STRING' as const,
        description: 'Target model: claude, gpt-4, gemini, llama, or general',
      },
      use_case: {
        type: 'STRING' as const,
        description: 'Use case: creative_writing, code_generation, data_analysis, chat, instruction, or other',
      },
      desired_output: {
        type: 'STRING' as const,
        description: 'What the user wants the prompt to achieve',
      },
      constraints: {
        type: 'STRING' as const,
        description: 'Any constraints or requirements',
      },
      additional_context: {
        type: 'STRING' as const,
        description: 'Additional context for the analysis',
      },
    },
    required: ['prompt_text'],
  },
};

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const body = await req.json();
  const { messages = [] } = body;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const contents: Array<{ role: string; parts: unknown[] }> = messages.map(
    (m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })
  );

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const keepAliveInterval = setInterval(() => {
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, 15_000);

      try {
        const stream = await ai.models.generateContentStream({
          model: 'gemini-2.0-flash',
          contents,
          config: {
            systemInstruction: ORCHESTRATOR_SYSTEM_PROMPT,
            tools: [{ functionDeclarations: [DISPATCH_ANALYSIS_TOOL] }],
            maxOutputTokens: 2048,
          },
        });

        for await (const chunk of stream) {
          if (chunk.text) {
            emit({ type: 'text_delta', text: chunk.text });
          }
          const fcs = chunk.functionCalls;
          if (fcs && fcs.length > 0) {
            for (const fc of fcs) {
              if (fc.name === 'dispatch_analysis') {
                emit({ type: 'analysis_dispatch', submission: fc.args });
              }
            }
          }
        }

        emit({ type: 'done' });
      } catch (err) {
        console.error('Orchestrator error:', err);
        emit({ type: 'error', message: String(err) });
      } finally {
        clearInterval(keepAliveInterval);
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
