"use client";

import { useBackHandler } from "@/lib/mobile/back-stack";

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
 * Dismissed by tapping the dimmed area, the handle, or the back button — it
 * registers with the back stack while it is open, so back closes this before
 * anything underneath it.
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
        className="relative max-h-[78%] overflow-y-auto rounded-t-2xl border-t border-tv-border bg-tv-panel shadow-[0_-8px_24px_rgba(0,0,0,0.5)] animate-[sheet-up_180ms_cubic-bezier(0.22,1,0.36,1)]"
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
