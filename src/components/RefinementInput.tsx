import { useState, useRef, useEffect } from 'react';

interface Props {
  onSubmit: (request: string) => void;
  disabled?: boolean;
  iteration: number;
}

export function RefinementInput({ onSubmit, disabled, iteration }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setText('');
  }

  return (
    <div className="refinement-input">
      <div className="refinement-input__label">
        Want to refine the prompt? Describe your changes below and we'll re-run the pipeline.
      </div>
      <div className="refinement-input__row">
        <textarea
          ref={textareaRef}
          className="refinement-input__textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. &quot;Make it more concise&quot;, &quot;Add few-shot examples&quot;, &quot;Change the tone to be more formal&quot;..."
          rows={2}
          disabled={disabled}
        />
        <button
          className="btn-primary refinement-input__btn"
          onClick={handleSubmit}
          disabled={!text.trim() || disabled}
        >
          Re-run (Iteration {iteration + 1})
        </button>
      </div>
    </div>
  );
}
