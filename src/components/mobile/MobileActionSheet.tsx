"use client";

import { useEffect, useRef } from "react";
import { useBackHandler } from "@/lib/mobile/back-stack";

/** How far the sheet must be pulled down before letting go closes it. */
const DISMISS_PX = 80;
/** A quick flick closes it from a shorter pull. */
const FLICK_PX_PER_MS = 0.6;

/**
 * A sheet that slides up from the bottom edge, over whatever is behind it.
 *
 * The counterpart to `MobileSheet`, which takes the whole screen. That one
 * suits a long list you browse — every timeframe, every drawing tool. This
 * one suits a short list of things to do to something you just pointed at: a
 * watchlist row, a price on the axis. Covering the screen to offer six
 * actions loses the context the actions are about, and a fullscreen panel
 * makes a quick choice feel like a trip somewhere else.
 *
 * Dismissed by tapping the dimmed area, the handle, the back button — it
 * registers with the back stack while it is open, so back closes this before
 * anything underneath it — or by pulling it down, from anywhere on it, while
 * its list is scrolled to the top.
 */
export function MobileActionSheet({
  title,
  label,
  onClose,
  children,
}: {
  /** Optional heading; omit for a bare list of actions. */
  title?: string;
  /**
   * Accessible name, when the sheet needs one it does not show — a list
   * whose every row already names what it acts on wants no heading, but
   * still has to announce itself.
   */
  label?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useBackHandler(true, onClose);

  /*
   * Pull down to dismiss.
   *
   * Native, non-passive touch listeners rather than React's: React's touch
   * handlers are passive, so they cannot stop the browser treating the pull
   * as an overscroll of the list, and pointer events are cancelled the moment
   * the browser claims the gesture — the same failure the watchlist drag and
   * the chart's drawing tools had. The pull only starts while the list is at
   * its top, so a sheet long enough to scroll still scrolls.
   */
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    let y0 = 0;
    let t0 = 0;
    let dy = 0;
    let pulling = false;
    const onStart = (e: TouchEvent) => {
      y0 = e.touches[0].clientY;
      t0 = performance.now();
      dy = 0;
      pulling = false;
      el.style.transition = "";
    };
    const onMove = (e: TouchEvent) => {
      dy = e.touches[0].clientY - y0;
      if (!pulling) {
        if (dy <= 6 || el.scrollTop > 0) return;
        pulling = true;
      }
      e.preventDefault();
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const onEnd = () => {
      if (!pulling) return;
      pulling = false;
      const fast = dy / Math.max(1, performance.now() - t0) > FLICK_PX_PER_MS;
      el.style.transition = "transform 160ms ease-out";
      if (dy > DISMISS_PX || (fast && dy > 24)) {
        el.style.transform = "translateY(100%)";
        setTimeout(() => closeRef.current(), 150);
      } else {
        el.style.transform = "";
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title ?? "Actions"}
    >
      <button
        className="absolute inset-0 bg-black/50 animate-[sheet-fade_140ms_ease-out]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="relative max-h-[78%] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-tv-border bg-tv-panel shadow-[0_-8px_24px_rgba(0,0,0,0.5)] animate-[sheet-up_180ms_cubic-bezier(0.22,1,0.36,1)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Grab handle — the affordance that says "this came from the bottom
            and goes back down", and a second, larger target to dismiss. */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex w-full justify-center py-2.5"
        >
          <span className="h-1 w-10 rounded-full bg-tv-border" />
        </button>
        {title && (
          <div className="px-4 pb-2 text-sm font-semibold text-tv-text">{title}</div>
        )}
        {children}
      </div>
    </div>
  );
}
