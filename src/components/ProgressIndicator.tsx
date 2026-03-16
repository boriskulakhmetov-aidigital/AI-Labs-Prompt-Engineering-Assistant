import { useState, useEffect } from 'react';

const STEPS = [
  'Analyzing prompt structure',
  'Evaluating clarity and specificity',
  'Checking model-specific optimization',
  'Identifying failure modes',
  'Generating optimized version',
  'Compiling final report',
];
const STEP_THRESHOLDS = [5, 15, 30, 45, 60, 80];

export function ProgressIndicator({ promptTitle, partial }: { promptTitle?: string; partial?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const doneCount = STEP_THRESHOLDS.filter(t => elapsed >= t).length;

  return (
    <div className="progress">
      <div className="progress__header">
        <div className="progress__spinner" />
        <div className="progress__title-group">
          <h2 className="progress__title">Analyzing Prompt...</h2>
          <p className="progress__sub">
            Running comprehensive analysis{promptTitle ? ` on "${promptTitle}"` : ''}.
            {elapsed > 30 && <> This typically takes 1-2 minutes.</>}
          </p>
        </div>
      </div>
      <div className="visualizing-steps">
        {STEPS.map((label, i) => {
          const icon = i < doneCount ? '✓' : i === doneCount ? '●' : '○';
          const cls = i < doneCount ? 'viz-step--done' : i === doneCount ? 'viz-step--pulse' : 'viz-step--pending';
          return (
            <div key={i} className={`viz-step ${cls}`}>
              <span className="viz-step__icon">{icon}</span>
              <span className="viz-step__label">{label}</span>
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
