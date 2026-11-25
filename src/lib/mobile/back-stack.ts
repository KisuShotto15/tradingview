"use client";

import { useEffect, useRef } from "react";

/**
 * Lets a component claim the back button while one of its own layers is open.
 *
 * `useAndroidBack` can only see state that lives in a store. Plenty of mobile
 * surfaces are local `useState` instead — a watchlist row's actions, the
 * chart's price-actions sheet, a "move to list" picker — and back sailed
 * straight past them to the layer underneath, or offered to leave the app
 * while a sheet was still covering the screen.
 *
 * Anything dismissible registers here while it is open. The most recently
 * opened one closes first, which is the order they were stacked in.
 */
type Entry = { close: () => void };

const stack: Entry[] = [];

/** Close the most recently opened registered layer. */
export function popBackHandler(): boolean {
  const top = stack.pop();
  if (!top) return false;
  top.close();
  return true;
}

/**
 * Claim the back button while `active`.
 *
 * The entry is registered once per open and calls through a ref, so a
 * re-render that gives `close` a new identity does not re-register the layer
 * and shuffle it to the top of the stack.
 */
export function useBackHandler(active: boolean, close: () => void): void {
  const closeRef = useRef(close);
  // Updated in an effect rather than during render: the entry below is
  // registered once per open, and this is what keeps it calling the latest
  // closure without re-registering and shuffling the stack order.
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!active) return;
    const entry: Entry = { close: () => closeRef.current() };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [active]);
}
