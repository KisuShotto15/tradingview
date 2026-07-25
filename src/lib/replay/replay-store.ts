"use client";

import { create } from "zustand";

/**
 * Bar-replay state. Session-only (NOT persisted) — replay is a transient mode,
 * not a saved preference.
 *
 * Model: the chart owns the full candle array; when replay is `active` it
 * renders the slice `candles[0..cursorIndex]`. `total` is kept up to date by the
 * chart so step/play can clamp without knowing the array itself. Indicators and
 * drawings derive from the candle array, so they truncate for free.
 */
interface ReplayState {
  /** Replay mode is on (feed is truncated, live WS paused). */
  active: boolean;
  /** Waiting for the user to click a start bar. */
  picking: boolean;
  /** The chosen start bar (for the "restart" control). */
  startIndex: number;
  /** Playhead: index of the last visible candle (inclusive). */
  cursorIndex: number;
  /** Auto-advancing. */
  playing: boolean;
  /** Bars revealed per second while playing. */
  speed: number;
  /** Total candles currently available (set by the chart). */
  total: number;

  /** Enter replay and wait for a start-bar click. */
  enterPicking: () => void;
  /** Commit the start bar (from the picker) and begin paused at that index. */
  setStart: (index: number) => void;
  /** Leave replay entirely and resume live data. */
  exit: () => void;
  /** Chart reports how many candles exist so clamping stays correct. */
  setTotal: (n: number) => void;
  /** Jump the playhead (clamped to [0, total-1]). */
  setCursor: (index: number) => void;
  /** Advance one bar; pauses automatically at the last bar. */
  stepForward: () => void;
  /** Rewind one bar. */
  stepBackward: () => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  /** Jump the playhead back to the chosen start bar. */
  restart: () => void;
}

const clamp = (i: number, max: number) => Math.max(0, Math.min(i, max));

export const useReplayStore = create<ReplayState>((set, get) => ({
  active: false,
  picking: false,
  startIndex: 0,
  cursorIndex: 0,
  playing: false,
  speed: 3,
  total: 0,

  enterPicking: () =>
    set({ active: true, picking: true, playing: false }),
  setStart: (index) =>
    set((s) => {
      const i = clamp(index, Math.max(0, s.total - 1));
      return { picking: false, startIndex: i, cursorIndex: i };
    }),
  exit: () =>
    set({ active: false, picking: false, playing: false }),
  setTotal: (total) =>
    set((s) => ({ total, cursorIndex: clamp(s.cursorIndex, Math.max(0, total - 1)) })),
  setCursor: (index) =>
    set((s) => ({ cursorIndex: clamp(index, Math.max(0, s.total - 1)) })),
  stepForward: () => {
    const { cursorIndex, total } = get();
    const last = Math.max(0, total - 1);
    if (cursorIndex >= last) {
      set({ playing: false });
      return;
    }
    set({ cursorIndex: cursorIndex + 1 });
  },
  stepBackward: () => {
    const { cursorIndex } = get();
    set({ cursorIndex: Math.max(0, cursorIndex - 1) });
  },
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (speed) => set({ speed }),
  restart: () => set((s) => ({ cursorIndex: clamp(s.startIndex, Math.max(0, s.total - 1)), playing: false })),
}));
