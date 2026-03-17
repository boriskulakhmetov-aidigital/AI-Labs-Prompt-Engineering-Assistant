export interface PromptSubmission {
  prompt_text?: string;          // full prompt (Route A)
  prompt_idea?: string;          // vague idea (Route B)
  needs_design: boolean;         // true = Route B (design first), false = Route A
  model_target?: string;         // e.g. 'claude', 'gpt-4', 'gemini', 'general'
  use_case?: string;             // e.g. 'creative_writing', 'code_generation', etc.
  desired_output?: string;       // what the user wants the prompt to achieve
  constraints?: string;          // any constraints or requirements
  additional_context?: string;
}

export interface PipelineJobRequest {
  submission: PromptSubmission;
  jobId: string;
  userId?: string;
  messages?: Array<{ role: string; content: string }>;
}

export interface PipelineJobStatus {
  status: 'pending' | 'designing' | 'testing' | 'engineering' | 'complete' | 'error';
  stage?: string;                // human-readable stage label
  designedPrompt?: string;       // output of PromptDesign (or original prompt)
  testResults?: string[];        // 3 test run outputs
  report?: string;               // final PromptEngineer report
  partial?: string;              // streaming partial for current stage
  error?: string;
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
}
