export function createOrbitCamera() {
  let yaw = 0.58;
  let pitch = 0.38;
  let drag: { id: number; x: number; y: number } | null = null;
  return {
    begin(id: number, x: number, y: number) {
      if (!drag) drag = { id, x, y };
    },
    move(id: number, x: number, y: number) {
      if (!drag || drag.id !== id) return;
      yaw -= (x - drag.x) * 0.006;
      pitch = Math.max(0.12, Math.min(1.35, pitch + (y - drag.y) * 0.006));
      drag.x = x; drag.y = y;
    },
    end(id: number) { if (drag?.id === id) drag = null; },
    cancel() { drag = null; },
    offset(distance: number) {
      return {
        x: Math.sin(yaw) * Math.cos(pitch) * distance,
        y: Math.sin(pitch) * distance,
        z: Math.cos(yaw) * Math.cos(pitch) * distance,
      };
    },
  };
}
