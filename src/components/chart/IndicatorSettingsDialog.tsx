"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useChartStore,
  DEFAULT_CONFIG,
  type IndicatorKey,
  type IndicatorConfig,
  type UserEMA,
} from "@/lib/store/chart-store";

const TITLES: Record<IndicatorKey, string> = {
  rsi: "RSI",
  macd: "MACD",
  volume: "Volume",
  adx: "ADX",
  squeeze: "Squeeze Momentum",
  vumanchu: "VuManChu Cipher B",
};

export function IndicatorSettingsDialog() {
  const target = useChartStore((s) => s.settingsTarget);
  const setTarget = useChartStore((s) => s.setSettingsTarget);
  const config = useChartStore((s) => s.config);
  const setConfig = useChartStore((s) => s.setConfig);
  const userEMAs = useChartStore((s) => s.userEMAs);
  const updateUserEMA = useChartStore((s) => s.updateUserEMA);

  const open = target !== null;
  const isEMA = typeof target === "object" && target !== null && target.kind === "ema";
  const emaInstance = isEMA ? userEMAs.find((e) => e.id === target.id) ?? null : null;

  const indicatorKey = !isEMA && target ? (target as IndicatorKey) : null;
  const titleText = isEMA
    ? `EMA ${emaInstance?.period ?? ""}`
    : indicatorKey
      ? TITLES[indicatorKey]
      : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setTarget(null);
      }}
    >
      <DialogContent className="max-w-sm bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {titleText} — Settings
          </DialogTitle>
        </DialogHeader>
        {isEMA && emaInstance && (
          <EMAForm
            instance={emaInstance}
            onSave={(patch) => {
              updateUserEMA(emaInstance.id, patch);
              setTarget(null);
            }}
            onClose={() => setTarget(null)}
          />
        )}
        {indicatorKey && (
          <SettingsForm
            target={indicatorKey}
            config={config}
            onSave={(patch) => {
              setConfig(patch);
              setTarget(null);
            }}
            onReset={() => {
              setConfig(DEFAULT_CONFIG);
              setTarget(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EMAForm({
  instance,
  onSave,
  onClose,
}: {
  instance: UserEMA;
  onSave: (patch: Partial<UserEMA>) => void;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState(instance.period);
  const [color, setColor] = useState(instance.color);
  const [lineWidth, setLineWidth] = useState(instance.lineWidth);

  useEffect(() => {
    setPeriod(instance.period);
    setColor(instance.color);
    setLineWidth(instance.lineWidth);
  }, [instance]);

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Period"
        value={period}
        min={2}
        max={500}
        onChange={(n) => setPeriod(n)}
      />
      <label className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Color
        </span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-7 w-9 cursor-pointer rounded border border-tv-border bg-transparent p-0.5"
          />
          <span className="font-mono text-[10px] uppercase text-tv-text-muted">
            {color}
          </span>
        </div>
      </label>
      <label className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Line width
        </span>
        <div className="flex items-center gap-1">
          {[1, 2, 3].map((w) => (
            <button
              key={w}
              onClick={() => setLineWidth(w)}
              className={`h-6 w-6 rounded text-[10px] ${
                lineWidth === w
                  ? "bg-tv-blue/20 text-tv-blue"
                  : "text-tv-text-muted hover:bg-tv-panel-hover"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </label>

      <div className="mt-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-tv-text-muted hover:text-tv-text"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onSave({
              period: clamp(period, 2, 500),
              color,
              lineWidth,
            })
          }
          className="bg-tv-blue hover:bg-tv-blue/90"
        >
          Apply
        </Button>
      </div>
    </div>
  );
}

interface FormProps {
  target: IndicatorKey;
  config: IndicatorConfig;
  onSave: (patch: Partial<IndicatorConfig>) => void;
  onReset: () => void;
}

function SettingsForm({ target, config, onSave, onReset }: FormProps) {
  const [draft, setDraft] = useState({
    rsi: config.rsi,
    macdFast: config.macdFast,
    macdSlow: config.macdSlow,
    macdSignal: config.macdSignal,
    adx: config.adx,
    squeezeBB: config.squeezeBB,
    squeezeBBMult: config.squeezeBBMult,
    squeezeKC: config.squeezeKC,
    squeezeKCMult: config.squeezeKCMult,
  });

  useEffect(() => {
    setDraft({
      rsi: config.rsi,
      macdFast: config.macdFast,
      macdSlow: config.macdSlow,
      macdSignal: config.macdSignal,
      adx: config.adx,
      squeezeBB: config.squeezeBB,
      squeezeBBMult: config.squeezeBBMult,
      squeezeKC: config.squeezeKC,
      squeezeKCMult: config.squeezeKCMult,
    });
  }, [config, target]);

  function save() {
    if (target === "rsi") onSave({ rsi: clamp(draft.rsi, 2, 100) });
    else if (target === "macd")
      onSave({
        macdFast: clamp(draft.macdFast, 2, 100),
        macdSlow: clamp(draft.macdSlow, 2, 200),
        macdSignal: clamp(draft.macdSignal, 2, 100),
      });
    else if (target === "adx") onSave({ adx: clamp(draft.adx, 2, 100) });
    else if (target === "squeeze")
      onSave({
        squeezeBB: clamp(draft.squeezeBB, 2, 200),
        squeezeBBMult: clamp(draft.squeezeBBMult, 0.1, 10),
        squeezeKC: clamp(draft.squeezeKC, 2, 200),
        squeezeKCMult: clamp(draft.squeezeKCMult, 0.1, 10),
      });
    else if (target === "volume") onSave({});
  }

  return (
    <div className="flex flex-col gap-3">
      {target === "rsi" && (
        <Field
          label="Period"
          value={draft.rsi}
          onChange={(n) => setDraft((d) => ({ ...d, rsi: n }))}
        />
      )}
      {target === "macd" && (
        <div className="grid grid-cols-3 gap-2">
          <Field
            label="Fast"
            value={draft.macdFast}
            onChange={(n) => setDraft((d) => ({ ...d, macdFast: n }))}
          />
          <Field
            label="Slow"
            value={draft.macdSlow}
            onChange={(n) => setDraft((d) => ({ ...d, macdSlow: n }))}
          />
          <Field
            label="Signal"
            value={draft.macdSignal}
            onChange={(n) => setDraft((d) => ({ ...d, macdSignal: n }))}
          />
        </div>
      )}
      {target === "adx" && (
        <Field
          label="Period"
          value={draft.adx}
          onChange={(n) => setDraft((d) => ({ ...d, adx: n }))}
        />
      )}
      {target === "squeeze" && (
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="BB length"
            value={draft.squeezeBB}
            onChange={(n) => setDraft((d) => ({ ...d, squeezeBB: n }))}
          />
          <FloatField
            label="BB mult"
            value={draft.squeezeBBMult}
            onChange={(n) => setDraft((d) => ({ ...d, squeezeBBMult: n }))}
          />
          <Field
            label="KC length"
            value={draft.squeezeKC}
            onChange={(n) => setDraft((d) => ({ ...d, squeezeKC: n }))}
          />
          <FloatField
            label="KC mult"
            value={draft.squeezeKCMult}
            onChange={(n) => setDraft((d) => ({ ...d, squeezeKCMult: n }))}
          />
        </div>
      )}
      {target === "volume" && (
        <p className="text-xs text-tv-text-muted">
          The volume indicator has no configurable parameters in this version.
        </p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-tv-text-muted hover:text-tv-text"
        >
          Reset defaults
        </Button>
        <Button size="sm" onClick={save} className="bg-tv-blue hover:bg-tv-blue/90">
          Apply
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  min = 2,
  max = 500,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
        {label}
      </span>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n)) onChange(n);
        }}
        className="bg-tv-bg tabular-nums"
      />
    </label>
  );
}

function FloatField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
        {label}
      </span>
      <Input
        type="number"
        step="0.1"
        min={0.1}
        max={10}
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        className="bg-tv-bg tabular-nums"
      />
    </label>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
