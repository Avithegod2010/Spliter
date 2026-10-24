import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { splIo, type SplJobEvent } from './native-io';

export type JobPhase = 'idle' | 'running' | 'done' | 'cancelled' | 'error';

export interface JobProgress {
  bytesDone: number;
  bytesTotal: number;
  partIndex: number;
  partsTotal: number;
}

const INITIAL_PROGRESS: JobProgress = { bytesDone: 0, bytesTotal: 0, partIndex: 0, partsTotal: 0 };

interface UseJobEngineOptions {
  onDone?: () => void;
}

/**
 * Drives one native job at a time: unique job id, live progress events,
 * cancellation, and progress resync when the app returns to the foreground
 * (the native side keeps working while the app is backgrounded).
 */
export function useJobEngine<TArgs, TResult>(
  run: (args: TArgs, jobId: string) => Promise<TResult>,
  options?: UseJobEngineOptions
) {
  const [phase, setPhase] = useState<JobPhase>('idle');
  const [progress, setProgress] = useState<JobProgress>(INITIAL_PROGRESS);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TResult | null>(null);
  const startedAtRef = useRef(0);
  const durationRef = useRef(0);
  const jobIdRef = useRef<string | null>(null);
  const phaseRef = useRef<JobPhase>('idle');
  const onDoneRef = useRef(options?.onDone);
  useEffect(() => {
    onDoneRef.current = options?.onDone;
  });

  const setPhaseBoth = (p: JobPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    const sub = splIo.addJobListener((event: SplJobEvent) => {
      if (event.jobId !== jobIdRef.current) return;
      if (event.phase === 'running') {
        setProgress({
          bytesDone: event.bytesDone,
          bytesTotal: event.bytesTotal,
          partIndex: event.partIndex,
          partsTotal: event.partsTotal,
        });
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const jobId = jobIdRef.current;
      if (!jobId || phaseRef.current !== 'running') return;
      // Native kept working while we were in the background — resync.
      splIo
        .lastJobEvent(jobId)
        .then((event) => {
          if (!event || event.jobId !== jobIdRef.current) return;
          if (event.phase === 'running') {
            setProgress({
              bytesDone: event.bytesDone,
              bytesTotal: event.bytesTotal,
              partIndex: event.partIndex,
              partsTotal: event.partsTotal,
            });
          }
        })
        .catch(() => {});
    });
    return () => appState.remove();
  }, []);

  const start = async (args: TArgs): Promise<TResult | null> => {
    if (phaseRef.current === 'running') return null;
    const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    jobIdRef.current = jobId;
    startedAtRef.current = Date.now();
    durationRef.current = 0;
    setProgress(INITIAL_PROGRESS);
    setError(null);
    setResult(null);
    setPhaseBoth('running');
    try {
      const res = await run(args, jobId);
      durationRef.current = Date.now() - startedAtRef.current;
      setResult(res);
      setPhaseBoth('done');
      onDoneRef.current?.();
      return res;
    } catch (e: unknown) {
      durationRef.current = Date.now() - startedAtRef.current;
      const code = (e as { code?: string })?.code;
      const message = e instanceof Error ? e.message : String(e);
      if (code === 'E_CANCELLED') {
        setPhaseBoth('cancelled');
      } else {
        setError(message || 'Something went wrong');
        setPhaseBoth('error');
      }
      return null;
    } finally {
      jobIdRef.current = null;
    }
  };

  const cancel = async () => {
    const jobId = jobIdRef.current;
    if (jobId) await splIo.cancel(jobId).catch(() => {});
  };

  const reset = () => {
    setPhaseBoth('idle');
    setProgress(INITIAL_PROGRESS);
    setError(null);
    setResult(null);
    jobIdRef.current = null;
  };

  return { phase, progress, error, result, durationMs: durationRef, start, cancel, reset };
}
