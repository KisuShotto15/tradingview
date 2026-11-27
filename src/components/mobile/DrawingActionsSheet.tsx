"use client";

import { useState } from "react";
import {
  AlarmClockPlus, AlarmClockOff, Bookmark, BookmarkPlus, ChevronLeft, ChevronRight, Copy, Eye,
  EyeOff, ListTree, Lock, Pin, RotateCcw, Settings2, Trash2, TrendingUp, Unlock, X,
} from "lucide-react";
import { useChartStore, type DrawingTemplate } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useMobileStore } from "@/lib/store/mobile-store";
import { useTradingStore } from "@/lib/store/trading-store";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { LINE_STYLE_KINDS, WIDTH_KINDS, styleOf } from "@/lib/drawings/style";
import type { AlertConfig, Drawing } from "@/lib/drawings/types";
import { cn } from "@/lib/utils";
import { MobileActionSheet } from "./MobileActionSheet";

const NO_TEMPLATES: DrawingTemplate[] = [];

/** Display names, for the "Add alert on …" row. */
const KIND_LABEL: Partial<Record<Drawing["kind"], string>> = {
  hline: "horizontal line",
  hray: "horizontal ray",
  trendline: "trend line",
  ray: "ray",
};

export type DrawingSheetView = "main" | "templates";

/**
 * Everything the selected drawing can do, as one list — TradingView's mobile
 * "⋯" sheet.
 *
 * On a phone the floating toolbar used to carry all of it at once: colour
 * pickers, four widths, three line styles and nine actions, in a bar that
 * scrolled sideways because no phone is that wide, so most of it was out of
 * sight behind a swipe nobody knew to make. The bar now keeps only what is
 * changed constantly (colour, delete) and this sheet holds the rest, where
 * every action has a name rather than an icon to decode.
 */
export function DrawingActionsSheet({
  drawing,
  initialView = "main",
  onPatch,
  onOpenSettings,
  onClose,
}: {
  drawing: Drawing;
  initialView?: DrawingSheetView;
  /** The toolbar's `patch`: writes the drawing and remembers its style. */
  onPatch: (p: Partial<Drawing>) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<DrawingSheetView>(initialView);
  const { remove, duplicate, update } = useDrawings();
  const openSheet = useMobileStore((s) => s.openSheet);
  const setTab = useMobileStore((s) => s.setTab);
  const apiKey = useTradingStore((s) => s.apiKey);
  const apiSecret = useTradingStore((s) => s.apiSecret);
  const updateForm = useTradingStore((s) => s.updateForm);

  const isPosition = drawing.kind === "long" || drawing.kind === "short";
  const alertKind = KIND_LABEL[drawing.kind];
  const alertOn = !!drawing.alert?.enabled;
  const hidden = drawing.hidden ?? false;
  const locked = drawing.locked ?? false;
  const connected = !!(apiKey && apiSecret);

  /** Run an action, then get out of the way. */
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };

  if (view === "templates") {
    return (
      <TemplatesView
        drawing={drawing}
        onBack={() => (initialView === "templates" ? onClose() : setView("main"))}
        onApply={(p) => {
          onPatch(p);
          onClose();
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <MobileActionSheet label="Drawing actions" onClose={onClose}>
      {alertKind && (
        <>
          <Row
            icon={alertOn ? <AlarmClockOff className="h-5 w-5" /> : <AlarmClockPlus className="h-5 w-5" />}
            onClick={act(() => {
              const next: AlertConfig = {
                enabled: !alertOn,
                sound: true,
                direction: "cross",
                lastTriggeredAt: undefined,
              };
              void update(drawing.id, { alert: next } as Partial<Drawing>);
            })}
          >
            {alertOn ? `Remove alert on ${alertKind}` : `Add alert on ${alertKind}`}
          </Row>
          <Divider />
        </>
      )}

      <Row icon={<Bookmark className="h-5 w-5" />} onClick={() => setView("templates")} chevron>
        Template
      </Row>
      <Row icon={<ListTree className="h-5 w-5" />} onClick={act(() => openSheet("objects"))}>
        Object tree…
      </Row>

      {/* Offered by kind, the same rule the desktop toolbar follows. */}
      {WIDTH_KINDS.has(drawing.kind) && (
        <Segmented label="Width">
          {(drawing.kind === "highlighter" ? [8, 14, 20, 28] : [1, 2, 3, 4]).map((w, i) => (
            <SegButton
              key={w}
              label={`Width ${w}`}
              active={drawing.lineWidth === w}
              onClick={() => onPatch({ lineWidth: w })}
            >
              <span className="block w-6 rounded-full bg-current" style={{ height: i + 1 }} />
            </SegButton>
          ))}
        </Segmented>
      )}
      {LINE_STYLE_KINDS.has(drawing.kind) && (
        <Segmented label="Line style">
          {([0, 1, 2] as const).map((ls) => (
            <SegButton
              key={ls}
              label={ls === 0 ? "Solid" : ls === 1 ? "Dashed" : "Dotted"}
              active={(drawing.lineStyle ?? 0) === ls}
              onClick={() => onPatch({ lineStyle: ls })}
            >
              <svg viewBox="0 0 24 4" className="w-7" aria-hidden>
                <line
                  x1="1" y1="2" x2="23" y2="2"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeDasharray={ls === 1 ? "6 4" : ls === 2 ? "0.1 4" : undefined}
                />
              </svg>
            </SegButton>
          ))}
        </Segmented>
      )}

      {isPosition && (
        <>
          <Divider />
          <Row
            icon={<TrendingUp className="h-5 w-5" />}
            disabled={!connected}
            hint={connected ? undefined : "Connect an exchange to create orders"}
            onClick={act(() => {
              if (drawing.kind !== "long" && drawing.kind !== "short") return;
              updateForm({
                side: drawing.kind === "long" ? "BUY" : "SELL",
                type: "LIMIT",
                price: drawing.entry.toString(),
                stopPrice: "",
                slEnabled: true,
                sl: drawing.stop.toString(),
                tpEnabled: true,
                tp: drawing.target.toString(),
              });
              // The order is reviewed and sent from the Trade tab, never
              // straight from a tap on a list.
              setTab("trade");
            })}
          >
            Create limit order…
          </Row>
        </>
      )}

      <Divider />
      <Row icon={<Copy className="h-5 w-5" />} onClick={act(() => void duplicate(drawing.id))}>
        Clone
      </Row>

      <Divider />
      <Row
        icon={locked ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
        onClick={act(() => onPatch({ locked: !locked }))}
      >
        {locked ? "Unlock" : "Lock"}
      </Row>
      <Row
        icon={hidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
        onClick={act(() => onPatch({ hidden: !hidden }))}
      >
        {hidden ? "Show" : "Hide"}
      </Row>
      <Row
        icon={<Trash2 className="h-5 w-5" />}
        onClick={act(() => {
          void remove(drawing.id);
          useDrawingsStore.getState().setSelected(null);
        })}
      >
        Remove
      </Row>

      <Divider />
      <Row icon={<Settings2 className="h-5 w-5" />} onClick={act(onOpenSettings)}>
        Settings…
      </Row>
    </MobileActionSheet>
  );
}

/** Save, reset and apply this kind's named styles. */
function TemplatesView({
  drawing,
  onBack,
  onApply,
  onClose,
}: {
  drawing: Drawing;
  onBack: () => void;
  onApply: (p: Partial<Drawing>) => void;
  onClose: () => void;
}) {
  const templates = useChartStore((s) => s.drawingTemplates[drawing.kind] ?? NO_TEMPLATES);
  const saveDrawingTemplate = useChartStore((s) => s.saveDrawingTemplate);
  const deleteDrawingTemplate = useChartStore((s) => s.deleteDrawingTemplate);
  const setToolDefault = useChartStore((s) => s.setToolDefault);
  const clearToolDefault = useChartStore((s) => s.clearToolDefault);

  return (
    <MobileActionSheet label="Templates" onClose={onClose}>
      <button
        onClick={onBack}
        className="flex w-full items-center gap-2 px-4 pb-2 text-left text-[15px] font-semibold text-tv-text"
      >
        <ChevronLeft className="h-5 w-5 text-tv-text-muted" />
        Template
      </button>
      <Divider />
      <Row
        icon={<BookmarkPlus className="h-5 w-5" />}
        onClick={() => {
          const name = window.prompt("Template name:");
          if (name && name.trim()) saveDrawingTemplate(drawing.kind, name.trim(), styleOf(drawing));
        }}
      >
        Save as template…
      </Row>
      <Row
        icon={<Pin className="h-5 w-5" />}
        onClick={() => {
          setToolDefault(drawing.kind, styleOf(drawing) as Parameters<typeof setToolDefault>[1]);
          onClose();
        }}
      >
        Save as default style
      </Row>
      <Row
        icon={<RotateCcw className="h-5 w-5" />}
        onClick={() => {
          clearToolDefault(drawing.kind);
          onClose();
        }}
      >
        Reset default style
      </Row>
      {templates.length > 0 && <Divider />}
      {templates.map((t) => (
        <div key={t.id} className="flex items-center active:bg-tv-panel-hover">
          <button
            onClick={() => onApply(t.style as Partial<Drawing>)}
            className="min-w-0 flex-1 truncate px-4 py-3.5 pl-[3.25rem] text-left text-[15px] text-tv-text"
          >
            {t.name}
          </button>
          <button
            aria-label={`Delete template ${t.name}`}
            onClick={() => deleteDrawingTemplate(drawing.kind, t.id)}
            className="flex h-12 w-12 shrink-0 items-center justify-center text-tv-text-muted active:text-tv-red"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ))}
    </MobileActionSheet>
  );
}

function Row({
  icon, children, onClick, chevron, disabled, hint,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  chevron?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-4 px-4 py-3.5 text-left text-[15px] text-tv-text active:bg-tv-panel-hover disabled:opacity-40"
    >
      <span className="shrink-0 text-tv-text-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        {children}
        {hint && <span className="block text-xs text-tv-text-muted">{hint}</span>}
      </span>
      {chevron && <ChevronRight className="h-5 w-5 shrink-0 text-tv-text-muted" />}
    </button>
  );
}

function Segmented({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-2">
      <span className="w-5 shrink-0" />
      <span className="min-w-0 flex-1 text-[15px] text-tv-text">{label}</span>
      <div className="flex shrink-0 gap-1 rounded-lg bg-tv-bg p-1">{children}</div>
    </div>
  );
}

function SegButton({
  children, label, active, onClick,
}: {
  children: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-9 w-11 items-center justify-center rounded-md",
        active ? "bg-tv-text text-tv-bg" : "text-tv-text-muted active:bg-tv-panel-hover",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-tv-border/70" />;
}
