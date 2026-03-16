import { useState, useEffect, useRef } from 'react';

interface PollResult {
  status: 'idle' | 'pending' | 'streaming' | 'complete' | 'error';
  partial?: string;
  report?: string;
  error?: string;
}

export function useSessionPoller(jobId: string | null): PollResult {
  const [result, setResult] = useState<PollResult>({ status: 'idle' });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) {
      setResult({ status: 'idle' });
      return;
    }

    setResult({ status: 'pending' });

    const poll = async () => {
      try {
        const res = await fetch(`/.netlify/functions/report-status?jobId=${encodeURIComponent(jobId)}`);
        const data = await res.json();
        setResult(data);

        if (data.status === 'complete' || data.status === 'error') {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        // retry on next tick
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId]);

  return result;
}
