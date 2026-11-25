"use client";

import { useMobileStore } from "@/lib/store/mobile-store";
import { JournalPanel } from "@/components/journal/JournalPanel";
import { MobileSheet } from "./MobileSheet";

/**
 * The trade journal's guardian, on a phone.
 *
 * `JournalPanel` is reused untouched: it is a read-only column of status
 * rows plus a token field, with no hover-revealed controls and nothing that
 * depends on a pointer, so it is one of the desktop pieces that needs no
 * touch adaptation (see CLAUDE.md, "Responsive shell"). Only the way in was
 * missing — the panel lives in the desktop right sidebar, which the mobile
 * shell does not render, so the journal had no entry point on a phone at all.
 */
export function MobileJournalSheet() {
  const closeSheet = useMobileStore((s) => s.closeSheet);
  return (
    <MobileSheet title="Journal" onClose={closeSheet}>
      <div className="h-full">
        <JournalPanel />
      </div>
    </MobileSheet>
  );
}
