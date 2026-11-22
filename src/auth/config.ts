export const authRules = {
  requestTimeoutMs: 12000,
  refreshBeforeExpiryMs: 60000,
  roomRefreshIntervalMs: 45000,
  roomRefreshMinIntervalMs: 1000,
  maxTokenLength: 8192,
} as const;
