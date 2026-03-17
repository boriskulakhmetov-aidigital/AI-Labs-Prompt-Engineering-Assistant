export type AppPhase = 'chat' | 'pipeline_running' | 'report_ready' | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface PromptSubmission {
  prompt_text?: string;
  prompt_idea?: string;
  needs_design: boolean;
  model_target?: string;
  use_case?: string;
  desired_output?: string;
  constraints?: string;
  additional_context?: string;
}

export interface PipelineStatus {
  status: 'pending' | 'designing' | 'testing' | 'engineering' | 'complete' | 'error';
  stage?: string;
  designedPrompt?: string;
  testResults?: string[];
  report?: string;
  partial?: string;
  error?: string;
}
