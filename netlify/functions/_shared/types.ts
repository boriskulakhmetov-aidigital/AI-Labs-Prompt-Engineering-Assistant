export interface PromptSubmission {
  prompt_text?: string;          // full prompt (Route A)
  prompt_idea?: string;          // vague idea (Route B)
  needs_design: boolean;         // true = Route B (design first), false = Route A
  model_target?: string;         // e.g. 'claude', 'gpt-4', 'gemini', 'general'
  use_case?: string;             // e.g. 'creative_writing', 'code_generation', etc.
  desired_output?: string;       // what the user wants the prompt to achieve
  constraints?: string;          // any constraints or requirements
  additional_context?: string;
  // Refinement mode fields
  refinement_request?: string;   // user's change request for the prompt
  base_prompt?: string;          // the engineered prompt to refine
  iteration?: number;            // which iteration this is (1 = first run, 2+ = refinement)
}

export interface PipelineJobRequest {
  submission: PromptSubmission;
  jobId: string;
  userId?: string;
  userEmail?: string;
  messages?: Array<{ role: string; content: string }>;
}

export interface PipelineJobStatus {
  status: 'pending' | 'revising' | 'designing' | 'testing' | 'engineering' | 'complete' | 'error';
  stage?: string;                // human-readable stage label
  designedPrompt?: string;       // output of PromptDesign (or original prompt)
  testResults?: string[];        // 3 test run outputs
  report?: string;               // final PromptEngineer report
  engineeredPrompt?: string;     // extracted re-engineered prompt for refinement
  partial?: string;              // streaming partial for current stage
  error?: string;
  iteration?: number;            // current iteration number
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
}
