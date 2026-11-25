/**
 * Eat the click the browser sends after a touch gesture that already did its
 * job.
 *
 * A long press opens something — a sheet, a menu — while the finger is still
 * down. When the finger lifts, the browser still sends the compatibility
 * `click` for that touch, and it is dispatched at the coordinates the finger
 * was at, which is now *inside the thing that just opened*. The watchlist's
 * long press opened a row's actions and the same gesture's click immediately
 * picked whichever action had appeared under the thumb, so the sheet seemed
 * to flash and vanish.
 *
 * Call this at the moment the gesture commits. The next click is swallowed in
 * the capture phase, before it reaches React, and the listener removes itself
 * either way — after one click, or after `WINDOW_MS` if no click follows (a
 * mouse long-press, or a browser that sends none).
 */
const WINDOW_MS = 700;

export function swallowNextClick(): void {
  if (typeof document === "undefined") return;

  let timer: ReturnType<typeof setTimeout> | null = null;

  const onClick = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    cleanup();
  };

  function cleanup() {
    if (timer !== null) clearTimeout(timer);
    document.removeEventListener("click", onClick, true);
  }

  document.addEventListener("click", onClick, true);
  timer = setTimeout(cleanup, WINDOW_MS);
}
