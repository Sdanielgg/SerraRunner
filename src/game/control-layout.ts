export type ControlPreferences = { size: 'normal' | 'large'; swapped: boolean };
export const defaultControlPreferences: ControlPreferences = { size: 'normal', swapped: false };
export const controlPreferencesKey = 'ramp-rivals:controls:v1';
export function parseControlPreferences(value: string | null): ControlPreferences {
  try { const parsed = JSON.parse(value ?? '{}'); return { size: parsed?.size === 'large' ? 'large' : 'normal', swapped: parsed?.swapped === true }; }
  catch { return { ...defaultControlPreferences }; }
}
export function drivingControlLayout(availableWidth: number, height: number, size: ControlPreferences['size']) {
  const gap = 12; const dockWidth = height < 440 ? 124 : 144;
  const stacked = availableWidth < 520 && height > availableWidth;
  const target = size === 'large' ? 88 : 76;
  const budget = Math.floor((availableWidth - (stacked ? gap * 3 : dockWidth + gap * 4)) / 4);
  const button = Math.max(56, Math.min(target, budget));
  return { button, gap, dockWidth, stacked, pedalHeight: size === 'large' ? height < 360 ? 100 : 108 : 96, steeringHeight: size === 'large' ? height < 360 ? 90 : 94 : 84, utilityHeight: 56 };
}
