export const reconnectionRules = {
  windowSeconds: 30,
  firstRetryMs: 300, maxRetryMs: 2000, retryFactor: 1.6,
  joinTimeoutMs: 12000, snapshotTimeoutMs: 8000, heartbeatMs: 1000,
  restoredMessageMs: 5000,
} as const;
export type ReconnectionConfig = { windowSeconds: number };
export function reconnectionConfig(value: Partial<ReconnectionConfig> = {}): ReconnectionConfig {
  const seconds = value.windowSeconds ?? reconnectionRules.windowSeconds;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw new Error('A janela de reconexão deve ser superior a zero e no máximo 300 segundos.');
  return { windowSeconds: seconds };
}
