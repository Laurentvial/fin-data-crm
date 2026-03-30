import type { MouseEvent } from "react";

/**
 * Native <select> dropdowns are rendered outside the modal DOM; after choosing an
 * option, browsers often synthesize a click on the overlay, which would close
 * the modal. Call suppressNextModalBackdropClose from select blur/change so
 * backdrop clicks are ignored briefly.
 */
let suppressUntil = 0;
const DEFAULT_SUPPRESS_MS = 450;

export function suppressNextModalBackdropClose(ms = DEFAULT_SUPPRESS_MS) {
  suppressUntil = Math.max(suppressUntil, Date.now() + ms);
}

export function shouldSuppressModalBackdropClose(): boolean {
  return Date.now() < suppressUntil;
}

/** Use on the modal overlay instead of onClose so target must be the overlay and guard applies */
export function modalBackdropClose(e: MouseEvent<HTMLElement>, onClose: () => void) {
  if (e.target !== e.currentTarget) return;
  if (shouldSuppressModalBackdropClose()) return;
  onClose();
}
