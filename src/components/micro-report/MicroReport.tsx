import { useState } from 'react';
import { renderMarkdown } from '@AiDigital-com/design-system/utils';
import './MicroReport.css';

export interface PEReportData {
  version: string;
  iteration: number;
  isRefinement: boolean;
  wasDesigned: boolean;
  refinementRequest: string | null;
  workingPrompt: string;
  testInput: string;
  testResults: string[];
  engineerAnalysis: string;
  engineeredPrompt: string;
  summary: {
    promptLength: number;
    engineeredPromptLength: number;
    testRunCount: number;
    avgTestResultLength: number;
    hasDesignPhase: boolean;
    model: string;
  };
}

interface Props {
  data: PEReportData;
}

export function MicroReport({ data }: Props) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [expandedTests, setExpandedTests] = useState<Record<number, boolean>>({});
  const [testInputOpen, setTestInputOpen] = useState(false);

  function handleCopy(text: string, field: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }

  function toggleTest(idx: number) {
    setExpandedTests(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  const iterationLabel = data.iteration > 1
    ? data.isRefinement ? `Iteration ${data.iteration} (Refinement)` : `Iteration ${data.iteration}`
    : null;

  const promptLabel = data.wasDesigned
    ? 'Designed Prompt'
    : data.isRefinement
      ? 'Revised Prompt'
      : 'Original Prompt';

  return (
    <div className="mr-pe">
      {/* Header */}
      <div className="mr-pe__header">
        <h1 className="mr-pe__title">Prompt Engineering Report</h1>
        {iterationLabel && (
          <span className="mr-pe__iteration-badge">{iterationLabel}</span>
        )}
      </div>

      {/* Refinement context */}
      {data.isRefinement && data.refinementRequest && (
        <div className="mr-pe__refinement-context">
          <strong>Refinement request:</strong> {data.refinementRequest}
        </div>
      )}

      {/* Working Prompt */}
      <section className="mr-pe__section">
        <div className="mr-pe__section-header">
          <h2 className="mr-pe__section-title">{promptLabel}</h2>
          <button
            className="mr-pe__copy-btn mr-pe__copy-btn--sm"
            onClick={() => handleCopy(data.workingPrompt, 'working')}
          >
            {copiedField === 'working' ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre className="mr-pe__code-block">{data.workingPrompt}</pre>
      </section>

      {/* Test Input */}
      <section className="mr-pe__section">
        <button
          className="mr-pe__collapsible-header"
          onClick={() => setTestInputOpen(!testInputOpen)}
        >
          <h2 className="mr-pe__section-title">Generated Test Input</h2>
          <span className="mr-pe__chevron">{testInputOpen ? '\u25B2' : '\u25BC'}</span>
        </button>
        {testInputOpen && (
          <div className="mr-pe__collapsible-body">
            <pre className="mr-pe__code-block mr-pe__code-block--muted">{data.testInput}</pre>
          </div>
        )}
      </section>

      {/* Test Results */}
      <section className="mr-pe__section">
        <h2 className="mr-pe__section-title">Test Results</h2>
        <div className="mr-pe__test-grid">
          {data.testResults.map((result, idx) => (
            <div key={idx} className="mr-pe__test-card">
              <button
                className="mr-pe__test-card-header"
                onClick={() => toggleTest(idx)}
              >
                <span className="mr-pe__test-label">Run {idx + 1}</span>
                <span className="mr-pe__chevron">{expandedTests[idx] ? '\u25B2' : '\u25BC'}</span>
              </button>
              {expandedTests[idx] && (
                <div className="mr-pe__test-card-body">
                  <pre className="mr-pe__code-block mr-pe__code-block--sm">{result}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Engineering Analysis */}
      <section className="mr-pe__section">
        <h2 className="mr-pe__section-title">Engineering Analysis</h2>
        <div
          className="mr-pe__analysis"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(data.engineerAnalysis) }}
        />
      </section>

      {/* Engineered Prompt */}
      {data.engineeredPrompt && (
        <section className="mr-pe__section mr-pe__section--highlight">
          <div className="mr-pe__section-header">
            <h2 className="mr-pe__section-title">Re-Engineered Prompt</h2>
          </div>
          <pre className="mr-pe__code-block mr-pe__code-block--accent">{data.engineeredPrompt}</pre>
          <button
            className="mr-pe__copy-btn mr-pe__copy-btn--lg"
            onClick={() => handleCopy(data.engineeredPrompt, 'engineered')}
          >
            {copiedField === 'engineered' ? 'Copied!' : 'Copy Prompt'}
          </button>
        </section>
      )}

      {/* Summary Stats */}
      <footer className="mr-pe__footer">
        <span className="mr-pe__stat">Prompt: {data.summary.promptLength} chars</span>
        {data.summary.engineeredPromptLength > 0 && (
          <span className="mr-pe__stat">Engineered: {data.summary.engineeredPromptLength} chars</span>
        )}
        <span className="mr-pe__stat">Test runs: {data.summary.testRunCount}</span>
        <span className="mr-pe__stat">Model: {data.summary.model}</span>
        {data.summary.hasDesignPhase && (
          <span className="mr-pe__stat">Design phase: Yes</span>
        )}
      </footer>
    </div>
  );
}
