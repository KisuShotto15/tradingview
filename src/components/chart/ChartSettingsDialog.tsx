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
      <DialogContent className="max-w-sm bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Chart settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <Section label="Canvas">
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
            <PairRow
              label="Body"
              up={draft.bodyUp}
              down={draft.bodyDown}
              onUp={(v) => setDraft((d) => ({ ...d, bodyUp: v }))}
              onDown={(v) => setDraft((d) => ({ ...d, bodyDown: v }))}
            />
            <PairRow
              label="Borders"
              up={draft.borderUp}
              down={draft.borderDown}
              onUp={(v) => setDraft((d) => ({ ...d, borderUp: v }))}
              onDown={(v) => setDraft((d) => ({ ...d, borderDown: v }))}
            />
            <PairRow
              label="Wick"
              up={draft.wickUp}
              down={draft.wickDown}
              onUp={(v) => setDraft((d) => ({ ...d, wickUp: v }))}
              onDown={(v) => setDraft((d) => ({ ...d, wickDown: v }))}
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
      <div className="flex flex-col gap-2">{children}</div>
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
      <ColorSwatch value={value} onChange={onChange} />
    </label>
  );
}

function PairRow({
  label,
  up,
  down,
  onUp,
  onDown,
}: {
  label: string;
  up: string;
  down: string;
  onUp: (v: string) => void;
  onDown: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-tv-text">{label}</span>
      <div className="flex items-center gap-2">
        <ColorSwatch value={up} onChange={onUp} />
        <ColorSwatch value={down} onChange={onDown} />
      </div>
    </div>
  );
}

function ColorSwatch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded border border-tv-border bg-transparent p-0.5"
        title={value}
      />
    </div>
  );
}
