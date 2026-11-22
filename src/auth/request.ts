import { authRules } from './config';

// AbortSignal.timeout is not available in every Expo Go runtime.
export const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init?.signal?.aborted) controller.abort();
  init?.signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, authRules.requestTimeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); init?.signal?.removeEventListener('abort', abort); }
};
