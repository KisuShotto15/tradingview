"use client";

import { useEffect, useState } from "react";

/**
 * Reactive "is the pointer a finger?" check.
 *
 * Deliberately `(pointer: coarse)` and not `useIsMobile()`. The two answer
 * different questions, and sizing a grab handle is the second one: a phone in
 * landscape and a tablet both need a finger-sized target while only one of
 * them gets the phone layout, and a narrow desktop window needs the small,
 * precise target even though it is phone-width. The W3C figure for a touch
 * target is 44px; a drawing handle cannot be that big without covering the
 * candles it marks, so the drawings pair a modest visible handle with a larger
 * invisible hit area — see `DrawHandle`.
 *
 * SSR-safe: `false` on the server and on the first client render, then the
 * real value after mount. Everything that reads it renders only once a drawing
 * is selected, which is long after that, so the initial `false` is never seen.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return coarse;
}
