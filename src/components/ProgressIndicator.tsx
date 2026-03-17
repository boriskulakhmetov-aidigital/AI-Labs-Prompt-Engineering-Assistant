import { useState, useEffect } from 'react';

const DESIGN_STEPS = [
  { key: 'pending', label: 'Initializing pipeline' },
  { key: 'designing', label: 'Designing prompt from idea' },
  { key: 'testing', label: 'Running 3 parallel test executions' },
  { key: 'engineering', label: 'Analyzing results & engineering improvements' },
];

const DIRECT_STEPS = [
  { key: 'pending', label: 'Initializing pipeline' },
  { key: 'testing', label: 'Running 3 parallel test executions' },
  { key: 'engineering', label: 'Analyzing results & engineering improvements' },
];

const REFINEMENT_STEPS = [
  { key: 'pending', label: 'Initializing pipeline' },
  { key: 'revising', label: 'Revising prompt based on your feedback' },
  { key: 'testing', label: 'Running 3 parallel test executions' },
  { key: 'engineering', label: 'Analyzing results & engineering improvements' },
];

interface Props {
  promptTitle?: string;
  partial?: string;
  pipelineStatus?: string;
  needsDesign?: boolean;
  isRefinement?: boolean;
  iteration?: number;
}

export function ProgressIndicator({ promptTitle, partial, pipelineStatus, needsDesign, isRefinement, iteration }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
  }, [iteration]);

  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const steps = isRefinement ? REFINEMENT_STEPS : needsDesign ? DESIGN_STEPS : DIRECT_STEPS;
  const currentIdx = steps.findIndex(s => s.key === pipelineStatus);

  const title = isRefinement
    ? `Refining Your Prompt (Iteration ${iteration ?? 2})...`
    : 'Engineering Your Prompt...';

  return (
    <div className="progress">
      <div className="progress__header">
        <div className="progress__spinner" />
        <div className="progress__title-group">
          <h2 className="progress__title">{title}</h2>
          <p className="progress__sub">
            {promptTitle ? `Working on "${promptTitle}"` : 'Processing your prompt'}.
            {elapsed > 30 && <> This typically takes 1-2 minutes.</>}
          </p>
        </div>
      </div>
      <div className="visualizing-steps">
        {steps.map((step, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          const icon = isDone ? '\u2713' : isCurrent ? '\u25CF' : '\u25CB';
          const cls = isDone ? 'viz-step--done' : isCurrent ? 'viz-step--pulse' : 'viz-step--pending';
          return (
            <div key={step.key} className={`viz-step ${cls}`}>
              <span className="viz-step__icon">{icon}</span>
              <span className="viz-step__label">{step.label}</span>
            </div>
          );
        })}
      </div>
      {partial && (
        <div className="progress__partial">
          <details>
            <summary>Live output preview</summary>
            <pre>{partial.slice(-2000)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
