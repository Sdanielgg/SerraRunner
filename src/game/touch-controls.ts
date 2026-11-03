import { type Controls, emptyControls } from './physics';

// Track fingers independently: releasing one must not release the others.
export function createTouchControls() {
  const fingers = new Map<number, keyof Controls>();
  function snapshot(): Controls {
    const controls = emptyControls();
    fingers.forEach(control => { controls[control] = true; });
    return controls;
  }
  return {
    press(identifier: number, control: keyof Controls) { fingers.set(identifier, control); return snapshot(); },
    release(identifier: number) { fingers.delete(identifier); return snapshot(); },
    clear() { fingers.clear(); return snapshot(); },
  };
}
