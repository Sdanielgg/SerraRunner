export const networkTiming = {
  simulationHz: 60, snapshotHz: 20, inputSendHz: 30,
  interpolationMs: 80, maxQueuedInputs: 30, maxBatchInputs: 8,
  predictionHistory: 180, correctionSeconds: 0.12, snapDistance: 4,
} as const;
