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
  DEFAULT_ADX_STYLE,
  DEFAULT_SQUEEZE_STYLE,
  DEFAULT_KEY_LEVELS,
  type IndicatorKey,
  type IndicatorConfig,
  type AdxStyle,
  type UserEMA,
  type SqueezeStyle,
  type KeyLevelsConfig,
} from "@/lib/store/chart-store";

const TITLES: Record<IndicatorKey, string> = {
  rsi: "RSI",
  macd: "MACD",
  volume: "Volume",
  adx: "ADX",
  squeeze: "Squeeze Momentum",
  vumanchu: "VuManChu Cipher B",
  obv: "On-Balance Volume",
  keylevels: "Key Levels (W,M,Q,Y)",
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
    adxDiLen: config.adxDiLen,
    adxKeyLevel: config.adxKeyLevel,
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
      adxDiLen: config.adxDiLen,
      adxKeyLevel: config.adxKeyLevel,
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
    else if (target === "adx")
      onSave({
        adx: clamp(draft.adx, 2, 100),
        adxDiLen: clamp(draft.adxDiLen, 2, 100),
        adxKeyLevel: clamp(draft.adxKeyLevel, 1, 100),
      });
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
          <SectionLabel>Inputs</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            <Field
              label="ADX Smoothing"
              value={draft.adx}
              onChange={(n) => setDraft((d) => ({ ...d, adx: n }))}
            />
            <Field
              label="DI Length"
              value={draft.adxDiLen}
              onChange={(n) => setDraft((d) => ({ ...d, adxDiLen: n }))}
            />
            <Field
              label="Key Level"
              value={draft.adxKeyLevel}
              onChange={(n) => setDraft((d) => ({ ...d, adxKeyLevel: n }))}
            />
          </div>
          <AdxStyleSection />
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
      {target === "obv" && (
        <p className="text-xs text-tv-text-muted">
          OBV uses cumulative volume signed by close direction. No parameters.
        </p>
      )}
      {target === "keylevels" && <KeyLevelsSettings />}

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

function AdxStyleSection() {
  const style = useChartStore((s) => s.adxStyle);
  const setAdxStyle = useChartStore((s) => s.setAdxStyle);
  const [draft, setDraft] = useState<AdxStyle>(style);

  useEffect(() => { setDraft(style); }, [style]);

  function commit(patch: Partial<AdxStyle>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    setAdxStyle(patch);
  }

  function WidthPicker({ value, onChange }: { value: 1 | 2 | 3 | 4; onChange: (v: 1 | 2 | 3 | 4) => void }) {
    return (
      <div className="flex items-center gap-1">
        {([1, 2, 3, 4] as const).map((w) => (
          <button
            key={w}
            onClick={() => onChange(w)}
            className={`h-6 w-6 rounded text-[10px] ${
              value === w ? "bg-tv-blue/20 text-tv-blue" : "text-tv-text-muted hover:bg-tv-panel-hover"
            }`}
          >
            {w}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Style — Lines</SectionLabel>
      <div className="flex items-center justify-between gap-2">
        <Toggle label="ADX" value={draft.showAdx} onChange={(v) => commit({ showAdx: v })} />
        <div className="flex items-center gap-2">
          <WidthPicker value={draft.adxLineWidth ?? 2} onChange={(v) => commit({ adxLineWidth: v })} />
          <ColorPick label="" value={draft.adxColor} onChange={(v) => commit({ adxColor: v })} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Toggle label="+DI" value={draft.showPlusDi} onChange={(v) => commit({ showPlusDi: v })} />
        <div className="flex items-center gap-2">
          <WidthPicker value={draft.diLineWidth ?? 1} onChange={(v) => commit({ diLineWidth: v })} />
          <ColorPick label="" value={draft.plusDiColor} onChange={(v) => commit({ plusDiColor: v })} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Toggle label="-DI" value={draft.showMinusDi} onChange={(v) => commit({ showMinusDi: v })} />
        <div className="flex items-center gap-2">
          <WidthPicker value={draft.diLineWidth ?? 1} onChange={(v) => commit({ diLineWidth: v })} />
          <ColorPick label="" value={draft.minusDiColor} onChange={(v) => commit({ minusDiColor: v })} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Toggle label="Key Level" value={draft.showKeyLevel} onChange={(v) => commit({ showKeyLevel: v })} />
        <div className="flex items-center gap-2">
          <WidthPicker value={draft.keyLevelLineWidth ?? 1} onChange={(v) => commit({ keyLevelLineWidth: v })} />
          <ColorPick label="" value={draft.keyLevelColor} onChange={(v) => commit({ keyLevelColor: v })} />
        </div>
      </div>
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
      <SectionLabel>Style — Colors (per-bar, Pine 4-color)</SectionLabel>
      <ColorPick
        label="Color 0 — increasing positive"
        value={draft.momentumIncPos}
        onChange={(v) => commit({ momentumIncPos: v })}
      />
      <ColorPick
        label="Color 1 — decreasing positive"
        value={draft.momentumDecPos}
        onChange={(v) => commit({ momentumDecPos: v })}
      />
      <ColorPick
        label="Color 2 — decreasing negative"
        value={draft.momentumDecNeg}
        onChange={(v) => commit({ momentumDecNeg: v })}
      />
      <ColorPick
        label="Color 3 — increasing negative"
        value={draft.momentumIncNeg}
        onChange={(v) => commit({ momentumIncNeg: v })}
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

/* ── Key Levels ────────────────────────────────────────────────────────── */

function KLCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-tv-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 accent-tv-blue"
      />
      <span>{label}</span>
    </label>
  );
}

function KLGroup({
  title,
  color,
  onColor,
  children,
}: {
  title: string;
  color: string;
  onColor: (c: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-tv-border bg-tv-bg/40 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
          {title}
        </span>
        <ColorPicker value={color} onChange={onColor} />
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">{children}</div>
    </div>
  );
}

function KeyLevelsSettings() {
  const kl = useChartStore((s) => s.keyLevels);
  const setKL = useChartStore((s) => s.setKeyLevels);

  function patch<K extends keyof KeyLevelsConfig>(
    section: K,
    diff: Partial<KeyLevelsConfig[K]>,
  ) {
    setKL({ [section]: { ...(kl[section] as object), ...diff } } as Partial<KeyLevelsConfig>);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Distance
          </span>
          <Input
            type="number"
            min={1}
            max={200}
            value={kl.distance}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n)) setKL({ distance: n });
            }}
            className="bg-tv-bg tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Text size
          </span>
          <select
            value={kl.textSize}
            onChange={(e) => setKL({ textSize: e.target.value as KeyLevelsConfig["textSize"] })}
            className="rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs text-tv-text"
          >
            <option value="Small">Small</option>
            <option value="Medium">Medium</option>
            <option value="Large">Large</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Line width
          </span>
          <select
            value={kl.lineWidth}
            onChange={(e) => setKL({ lineWidth: e.target.value as KeyLevelsConfig["lineWidth"] })}
            className="rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs text-tv-text"
          >
            <option value="Small">Small</option>
            <option value="Medium">Medium</option>
            <option value="Large">Large</option>
          </select>
        </label>
      </div>

      <KLCheck
        label="Always show (extend lines into chart area)"
        checked={kl.alwaysShow}
        onChange={(v) => setKL({ alwaysShow: v })}
      />

      <KLGroup title="Daily" color={kl.daily.color} onColor={(c) => patch("daily", { color: c })}>
        <KLCheck label="Daily Open" checked={kl.daily.open} onChange={(v) => patch("daily", { open: v })} />
        <KLCheck label="Previous Daily Open" checked={kl.daily.prevOpen} onChange={(v) => patch("daily", { prevOpen: v })} />
        <KLCheck label="Previous H/L" checked={kl.daily.prevHL} onChange={(v) => patch("daily", { prevHL: v })} />
        <KLCheck label="Previous Mid" checked={kl.daily.prevMid} onChange={(v) => patch("daily", { prevMid: v })} />
      </KLGroup>

      <KLGroup title="Monday Range" color={kl.monday.color} onColor={(c) => patch("monday", { color: c })}>
        <KLCheck label="Monday Range" checked={kl.monday.range} onChange={(v) => patch("monday", { range: v })} />
        <KLCheck label="Monday Mid" checked={kl.monday.mid} onChange={(v) => patch("monday", { mid: v })} />
      </KLGroup>

      <KLGroup title="Weekly" color={kl.weekly.color} onColor={(c) => patch("weekly", { color: c })}>
        <KLCheck label="Weekly Open" checked={kl.weekly.open} onChange={(v) => patch("weekly", { open: v })} />
        <KLCheck label="Previous Weekly Open" checked={kl.weekly.prevOpen} onChange={(v) => patch("weekly", { prevOpen: v })} />
        <KLCheck label="Previous H/L" checked={kl.weekly.prevHL} onChange={(v) => patch("weekly", { prevHL: v })} />
        <KLCheck label="Previous Mid" checked={kl.weekly.prevMid} onChange={(v) => patch("weekly", { prevMid: v })} />
      </KLGroup>

      <KLGroup title="Monthly" color={kl.monthly.color} onColor={(c) => patch("monthly", { color: c })}>
        <KLCheck label="Monthly Open" checked={kl.monthly.open} onChange={(v) => patch("monthly", { open: v })} />
        <KLCheck label="Previous Monthly Open" checked={kl.monthly.prevOpen} onChange={(v) => patch("monthly", { prevOpen: v })} />
        <KLCheck label="Previous H/L" checked={kl.monthly.prevHL} onChange={(v) => patch("monthly", { prevHL: v })} />
        <KLCheck label="Previous Mid" checked={kl.monthly.prevMid} onChange={(v) => patch("monthly", { prevMid: v })} />
      </KLGroup>

      <KLGroup title="Quarterly" color={kl.quarterly.color} onColor={(c) => patch("quarterly", { color: c })}>
        <KLCheck label="Quarterly Open" checked={kl.quarterly.open} onChange={(v) => patch("quarterly", { open: v })} />
        <KLCheck label="Previous Quarterly Open" checked={kl.quarterly.prevOpen} onChange={(v) => patch("quarterly", { prevOpen: v })} />
        <KLCheck label="Previous H/L" checked={kl.quarterly.prevHL} onChange={(v) => patch("quarterly", { prevHL: v })} />
        <KLCheck label="Previous Mid" checked={kl.quarterly.prevMid} onChange={(v) => patch("quarterly", { prevMid: v })} />
      </KLGroup>

      <KLGroup title="Yearly" color={kl.yearly.color} onColor={(c) => patch("yearly", { color: c })}>
        <KLCheck label="Yearly Open" checked={kl.yearly.open} onChange={(v) => patch("yearly", { open: v })} />
        <KLCheck label="Previous Yearly Open" checked={kl.yearly.prevOpen} onChange={(v) => patch("yearly", { prevOpen: v })} />
        <KLCheck label="Current H/L" checked={kl.yearly.currHL} onChange={(v) => patch("yearly", { currHL: v })} />
        <KLCheck label="Current Mid" checked={kl.yearly.currMid} onChange={(v) => patch("yearly", { currMid: v })} />
      </KLGroup>

      <KLGroup title="4H" color={kl.fourHour.color} onColor={(c) => patch("fourHour", { color: c })}>
        <KLCheck label="4H Open" checked={kl.fourHour.open} onChange={(v) => patch("fourHour", { open: v })} />
        <KLCheck label="Previous H/L" checked={kl.fourHour.prevHL} onChange={(v) => patch("fourHour", { prevHL: v })} />
        <KLCheck label="Previous Mid" checked={kl.fourHour.prevMid} onChange={(v) => patch("fourHour", { prevMid: v })} />
      </KLGroup>

      <button
        type="button"
        onClick={() => setKL(DEFAULT_KEY_LEVELS)}
        className="mt-1 self-end text-[10px] text-tv-text-muted underline hover:text-tv-text"
      >
        Reset to defaults
      </button>
    </div>
  );
}
