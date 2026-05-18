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
import { ColorPicker } from "@/components/ui/color-picker";
import {
  useChartStore,
  DEFAULT_CONFIG,
  DEFAULT_SQUEEZE_STYLE,
  type IndicatorKey,
  type IndicatorConfig,
  type UserEMA,
  type SqueezeStyle,
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
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Color
        </span>
        <ColorPicker value={color} onChange={(v) => setColor(v)} />
      </div>
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
        <>
          <Field
            label="Period"
            value={draft.rsi}
            onChange={(n) => setDraft((d) => ({ ...d, rsi: n }))}
          />
          <OverlaySection target="rsi" />
        </>
      )}
      {target === "macd" && (
        <>
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
          <OverlaySection target="macd" />
        </>
      )}
      {target === "adx" && (
        <>
          <Field
            label="Period"
            value={draft.adx}
            onChange={(n) => setDraft((d) => ({ ...d, adx: n }))}
          />
          <OverlaySection target="adx" />
        </>
      )}
      {target === "squeeze" && (
        <>
          <SectionLabel>Inputs</SectionLabel>
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
          <SqueezeStyleSection />
          <OverlaySection target="squeeze" />
        </>
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-tv-text-muted">
      {children}
    </div>
  );
}

function ColorPick({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-tv-text">{label}</span>
      <ColorPicker value={value} onChange={onChange} />
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2">
      <span className="text-xs text-tv-text">{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-tv-blue"
      />
    </label>
  );
}

const OVERLAY_OPTIONS: { value: IndicatorKey | "own"; label: string }[] = [
  { value: "own", label: "Own pane" },
  { value: "rsi", label: "RSI pane" },
  { value: "macd", label: "MACD pane" },
  { value: "adx", label: "ADX pane" },
  { value: "squeeze", label: "Squeeze pane" },
  { value: "vumanchu", label: "VuManChu pane" },
];

function OverlaySection({ target }: { target: IndicatorKey }) {
  const overlays = useChartStore((s) => s.indicatorOverlays);
  const setIndicatorOverlay = useChartStore((s) => s.setIndicatorOverlay);
  const indicators = useChartStore((s) => s.indicators);
  const current = overlays[target] ?? "own";

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Pane</SectionLabel>
      <label className="flex items-center justify-between gap-3">
        <span className="text-xs text-tv-text">Overlay on</span>
        <select
          value={current}
          onChange={(e) =>
            setIndicatorOverlay(target, e.target.value as IndicatorKey | "own")
          }
          className="rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs"
        >
          {OVERLAY_OPTIONS.filter(
            (o) =>
              o.value === "own" ||
              (o.value !== target && indicators[o.value as IndicatorKey]),
          ).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[10px] text-tv-text-muted">
        Place this indicator on top of another indicator&apos;s pane instead of
        its own.
      </p>
    </div>
  );
}

function SqueezeStyleSection() {
  const style = useChartStore((s) => s.squeezeStyle);
  const setSqueezeStyle = useChartStore((s) => s.setSqueezeStyle);
  const [draft, setDraft] = useState<SqueezeStyle>(style);

  useEffect(() => {
    setDraft(style);
  }, [style]);

  function commit(patch: Partial<SqueezeStyle>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    setSqueezeStyle(patch);
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Style — Momentum</SectionLabel>
      <ColorPick
        label="Increasing positive"
        value={draft.momentumIncPos}
        onChange={(v) => commit({ momentumIncPos: v })}
      />
      <ColorPick
        label="Decreasing positive"
        value={draft.momentumDecPos}
        onChange={(v) => commit({ momentumDecPos: v })}
      />
      <ColorPick
        label="Increasing negative"
        value={draft.momentumIncNeg}
        onChange={(v) => commit({ momentumIncNeg: v })}
      />
      <ColorPick
        label="Decreasing negative"
        value={draft.momentumDecNeg}
        onChange={(v) => commit({ momentumDecNeg: v })}
      />

      <SectionLabel>Style — Squeeze dots</SectionLabel>
      <ColorPick
        label="Squeeze on"
        value={draft.squeezeOn}
        onChange={(v) => commit({ squeezeOn: v })}
      />
      <ColorPick
        label="Squeeze off"
        value={draft.squeezeOff}
        onChange={(v) => commit({ squeezeOff: v })}
      />
      <ColorPick
        label="No squeeze"
        value={draft.noSqueeze}
        onChange={(v) => commit({ noSqueeze: v })}
      />

      <SectionLabel>Visibility</SectionLabel>
      <Toggle
        label="Show momentum histogram"
        value={draft.showMomentum}
        onChange={(v) => commit({ showMomentum: v })}
      />
      <Toggle
        label="Show squeeze state dots"
        value={draft.showSqueezeDots}
        onChange={(v) => commit({ showSqueezeDots: v })}
      />

      <button
        type="button"
        onClick={() => {
          setDraft(DEFAULT_SQUEEZE_STYLE);
          setSqueezeStyle(DEFAULT_SQUEEZE_STYLE);
        }}
        className="mt-1 self-end text-[10px] text-tv-text-muted underline hover:text-tv-text"
      >
        Reset style
      </button>
    </div>
  );
}
