"use client";

import { Check, Settings2 } from "lucide-react";
import { useChartStore, type IndicatorKey } from "@/lib/store/chart-store";
import { useMobileStore } from "@/lib/store/mobile-store";
import { MobileSheet } from "./MobileSheet";
import { cn } from "@/lib/utils";

/** Mobile-friendly indicators list — replaces the dropdown menu on touch. */

interface Entry {
  key: IndicatorKey;
  label: string;
  group: string;
}

const ENTRIES: Entry[] = [
  { key: "volume",    group: "Volume",      label: "Volume" },
  { key: "obv",       group: "Volume",      label: "On-Balance Volume (OBV)" },
  { key: "rsi",       group: "Oscillators", label: "RSI" },
  { key: "macd",      group: "Oscillators", label: "MACD" },
  { key: "adx",       group: "Trend",       label: "ADX" },
  { key: "squeeze",   group: "Momentum",    label: "Squeeze Momentum [LazyBear]" },
  { key: "vumanchu",  group: "Momentum",    label: "VuManChu Cipher B + Div" },
  { key: "keylevels", group: "Levels",      label: "Key Levels (W,M,Q,Y)" },
];

export function MobileIndicatorsSheet() {
  const indicators = useChartStore((s) => s.indicators);
  const toggle = useChartStore((s) => s.toggleIndicator);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const closeSheet = useMobileStore((s) => s.closeSheet);

  const groups = ENTRIES.reduce<Record<string, Entry[]>>((acc, e) => {
    (acc[e.group] ||= []).push(e);
    return acc;
  }, {});

  return (
    <MobileSheet title="Indicators" onClose={closeSheet}>
      {Object.entries(groups).map(([group, entries]) => (
        <section key={group}>
          <h3 className="bg-tv-panel/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            {group}
          </h3>
          {entries.map((e) => {
            const on = indicators[e.key];
            return (
              <div
                key={e.key}
                className="flex items-center gap-3 border-b border-tv-border/60 px-3 py-3"
              >
                <button
                  onClick={() => toggle(e.key)}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded border",
                    on ? "border-tv-blue bg-tv-blue text-white" : "border-tv-border bg-tv-bg",
                  )}
                  aria-pressed={on}
                  aria-label={`${on ? "Disable" : "Enable"} ${e.label}`}
                >
                  {on && <Check className="h-3.5 w-3.5" />}
                </button>
                <span className="flex-1 text-sm">{e.label}</span>
                {on && (
                  <button
                    onClick={() => {
                      setSettingsTarget(e.key);
                      closeSheet();
                    }}
                    aria-label={`Settings for ${e.label}`}
                    className="rounded p-1.5 text-tv-text-muted active:bg-tv-panel-hover"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </MobileSheet>
  );
}
