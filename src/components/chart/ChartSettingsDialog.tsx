"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useChartStore,
  DEFAULT_CHART_COLORS,
  type ChartColors,
} from "@/lib/store/chart-store";

export function ChartSettingsDialog() {
  const open = useChartStore((s) => s.chartSettingsOpen);
  const setOpen = useChartStore((s) => s.setChartSettingsOpen);
  const chartColors = useChartStore((s) => s.chartColors);
  const setChartColors = useChartStore((s) => s.setChartColors);

  const [draft, setDraft] = useState<ChartColors>(chartColors);

  useEffect(() => {
    setDraft(chartColors);
  }, [chartColors, open]);

  function apply() {
    setChartColors(draft);
    setOpen(false);
  }

  function reset() {
    setDraft({ ...DEFAULT_CHART_COLORS });
    setChartColors({ ...DEFAULT_CHART_COLORS });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xs bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Chart settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Section label="Background">
            <ColorRow
              label="Background"
              value={draft.bg}
              onChange={(v) => setDraft((d) => ({ ...d, bg: v }))}
            />
            <ColorRow
              label="Grid lines"
              value={draft.gridLines}
              onChange={(v) => setDraft((d) => ({ ...d, gridLines: v }))}
            />
          </Section>

          <Section label="Candles">
            <ColorRow
              label="Bullish body"
              value={draft.candleUp}
              onChange={(v) => setDraft((d) => ({ ...d, candleUp: v }))}
            />
            <ColorRow
              label="Bearish body"
              value={draft.candleDown}
              onChange={(v) => setDraft((d) => ({ ...d, candleDown: v }))}
            />
            <ColorRow
              label="Bullish wick"
              value={draft.wickUp}
              onChange={(v) => setDraft((d) => ({ ...d, wickUp: v }))}
            />
            <ColorRow
              label="Bearish wick"
              value={draft.wickDown}
              onChange={(v) => setDraft((d) => ({ ...d, wickDown: v }))}
            />
          </Section>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            className="text-tv-text-muted hover:text-tv-text"
          >
            Reset defaults
          </Button>
          <Button size="sm" onClick={apply} className="bg-tv-blue hover:bg-tv-blue/90">
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-tv-text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-xs text-tv-text">{label}</span>
      <div className="relative flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-tv-border bg-transparent p-0.5"
        />
        <span className="w-16 text-right font-mono text-[10px] uppercase text-tv-text-muted">
          {value}
        </span>
      </div>
    </label>
  );
}
