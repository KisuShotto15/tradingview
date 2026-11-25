"use client";

import { useEffect, useState } from "react";

/**
 * Width below which the layout is a phone layout — Tailwind's `md`.
 */
const MOBILE_BREAKPOINT = 768;

/**
 * Height below which a *touch* device is treated as a phone regardless of its
 * width.
 *
 * A phone held sideways is ~915 x 412, which clears the width breakpoint and
 * used to drop the user straight into the desktop layout: both sidebars, the
 * status bar and the full-size indicator chips, with the chart squeezed into
 * barely half the screen. Rotating is the one gesture whose entire purpose is
 * to give the chart *more* room, so getting the desktop shell instead is the
 * opposite of what the gesture asks for.
 *
 * 500px is comfortably above every phone's landscape height and below any
 * window someone would actually run the desktop layout in.
 */
const MOBILE_LANDSCAPE_MAX_HEIGHT = 500;

/**
 * Reactive "is this a phone-sized viewport?" check.
 *
 * The height clause is gated on `(pointer: coarse)` so a short *desktop*
 * window — a laptop with the browser half-height, or a dev tools panel taking
 * the bottom of the screen — keeps the desktop layout, which is what a mouse
 * user expects. Only a touch device that is short gets the phone shell.
 *
 * SSR-safe: returns `false` during the first render on the server and the
 * initial client render, then re-renders with the real value after mount.
 * This avoids hydration mismatches while keeping the component reactive.
 * Anything that reads it inside an effect must therefore be prepared to run
 * once with `false` and be re-applied — see `PriceChart`'s pane stretch.
 */
export function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query =
      `(max-width: ${breakpoint - 1}px), ` +
      `((max-height: ${MOBILE_LANDSCAPE_MAX_HEIGHT}px) and (pointer: coarse))`;
    const mql = window.matchMedia(query);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}
