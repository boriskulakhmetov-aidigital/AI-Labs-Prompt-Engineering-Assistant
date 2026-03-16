export interface PromptSubmission {
  prompt_text: string;
  model_target?: string;        // e.g. 'claude', 'gpt-4', 'gemini', 'general'
  use_case?: string;            // e.g. 'creative_writing', 'code_generation', 'data_analysis', 'chat', 'instruction'
  desired_output?: string;      // what the user wants the prompt to achieve
  constraints?: string;         // any constraints or requirements
  additional_context?: string;
}

export interface AnalysisJobRequest {
  submission: PromptSubmission;
  jobId: string;
  userId?: string;
  messages?: Array<{ role: string; content: string }>;
}

export interface AnalysisJobStatus {
  status: 'pending' | 'streaming' | 'complete' | 'error';
  partial?: string;
  report?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
}
