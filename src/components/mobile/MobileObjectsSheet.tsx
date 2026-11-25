"use client";

import { useMobileStore } from "@/lib/store/mobile-store";
import { ObjectTreePanel } from "@/components/chart/ObjectTreePanel";
import { MobileSheet } from "./MobileSheet";

/**
 * The drawings list, on a phone — the gap CLAUDE.md listed under "Responsive
 * shell": every drawing had to be found by tapping it on the canvas, which is
 * exactly what a list exists to avoid once a chart has a dozen of them.
 *
 * `ObjectTreePanel` is reused rather than reimplemented. Its per-row controls
 * were hover-revealed, which never becomes visible on touch, but that is one
 * media query inside the panel (`(hover: none)`) rather than a reason to
 * build a second list that would drift from this one. The query asks the
 * right question too: whether the device can hover, not how wide it is — a
 * narrow desktop window hovers fine and keeps the reveal-on-hover behaviour.
 */
export function MobileObjectsSheet() {
  const closeSheet = useMobileStore((s) => s.closeSheet);
  return (
    <MobileSheet title="Objects" onClose={closeSheet}>
      <div className="h-full">
        <ObjectTreePanel />
      </div>
    </MobileSheet>
  );
}
