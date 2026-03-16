export type AppPhase = 'chat' | 'analysis_running' | 'report_ready' | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface PromptSubmission {
  prompt_text: string;
  model_target?: string;
  use_case?: string;
  desired_output?: string;
  constraints?: string;
  additional_context?: string;
}
