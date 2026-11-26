"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bookmark, BookmarkPlus, Check, Copy, Eye, EyeOff, Lock, Pin, RotateCcw, Settings2, Trash2, TrendingUp, Unlock, X } from "lucide-react";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTradingStore } from "@/lib/store/trading-store";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Drawing } from "@/lib/drawings/types";
import { LINE_STYLE_KINDS, WIDTH_KINDS, pickStyle, styleOf } from "@/lib/drawings/style";
import type { DrawingTemplate } from "@/lib/store/chart-store";

// Stable empty-array reference: a fresh `[]` on every selector call would
// give useSyncExternalStore a snapshot that "changes" on every render even
// when nothing did, which crashes with "Maximum update depth exceeded" the
// instant a drawing kind with no saved templates gets selected.
const NO_TEMPLATES: DrawingTemplate[] = [];

interface Props {
  containerSize: { width: number; height: number };
  onOpenSettings: () => void;
}

export function FloatingContextToolbar({ containerSize, onOpenSettings }: Props) {
  const selectedId = useDrawingsStore((s) => s.selectedId);
  const drawings = useDrawingsStore((s) => s.drawings);
  const drawing = selectedId ? drawings.find((d) => d.id === selectedId) ?? null : null;

  const { update, remove, duplicate } = useDrawings();

  const isMobile = useIsMobile();
  const [pos, setPos] = useState({ x: -9999, y: 8 });
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const prevIdRef = useRef<string | null>(null);

  /*
   * Snap on a new selection, after layout so the size is known.
   *
   * Top-right with a mouse; bottom-centre on touch. The top of a phone screen
   * is both where the legend already is — the bar at full touch size covers
   * the whole OHLC row — and the one place a thumb cannot reach without
   * shifting grip, which is the same reason the chart toolbar sits at the
   * bottom. It is still draggable from either starting point.
   */
  useLayoutEffect(() => {
    if (!selectedId || selectedId === prevIdRef.current) return;
    prevIdRef.current = selectedId;
    const tw = toolbarRef.current?.offsetWidth ?? 0;
    const th = toolbarRef.current?.offsetHeight ?? 0;
    setPos(
      isMobile
        ? {
            x: Math.max(0, (containerSize.width - tw) / 2),
            y: Math.max(0, containerSize.height - th - 12),
          }
        : { x: Math.max(0, containerSize.width - tw - 16), y: 8 },
    );
  });

  // Clamp inside container on resize
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    setPos((p) => ({
      x: Math.min(p.x, Math.max(0, containerSize.width - el.offsetWidth)),
      y: Math.min(p.y, Math.max(0, containerSize.height - el.offsetHeight)),
    }));
  }, [containerSize]);

  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: pos.x, py: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const tw = toolbarRef.current?.offsetWidth ?? 0;
    const th = toolbarRef.current?.offsetHeight ?? 0;
    setPos({
      x: Math.max(0, Math.min(dragRef.current.px + e.clientX - dragRef.current.ox, containerSize.width - tw)),
      y: Math.max(0, Math.min(dragRef.current.py + e.clientY - dragRef.current.oy, containerSize.height - th)),
    });
  }
  function onPointerUp() { dragRef.current = null; }

  if (!drawing) return null;

  const isPosition = drawing.kind === "long" || drawing.kind === "short";

  function patch(p: Partial<Drawing>) {
    void update(drawing!.id, p);
    /*
     * The last style used becomes the next drawing's style — but only the
     * style. Hide and lock go through this same function, and writing them
     * into the defaults made every following drawing of the kind arrive
     * hidden or locked.
     */
    const style = pickStyle(p);
    if (Object.keys(style).length > 0) {
      useChartStore.getState().setToolDefault(
        drawing!.kind as DrawingTool,
        style as Parameters<ReturnType<typeof useChartStore.getState>["setToolDefault"]>[1],
      );
    }
  }

  return (
    /*
     * The bar is never allowed to be wider than the chart it floats over.
     *
     * At touch size every control is 32px, and a long/short drawing carries
     * three colour pickers, seven actions and the limit-order button — more
     * than a phone is wide. The bar then ran off both edges whatever the
     * clamp did, because the clamp can only move something that fits. Capping
     * the width and letting the controls scroll sideways keeps all of them
     * reachable, the same way the mobile chart toolbar below it works. The
     * drag handle stays outside the scroller so the bar can always be moved.
     */
    <div
      ref={toolbarRef}
      className="pointer-events-auto absolute z-30 flex h-7 [@media(hover:none)]:h-11 max-w-full items-stretch rounded border border-tv-border bg-tv-panel shadow-lg"
      style={{ left: pos.x, top: pos.y, maxWidth: containerSize.width, userSelect: "none" }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Drag handle */}
      <div
        className="flex shrink-0 cursor-grab items-center px-1.5 [@media(hover:none)]:px-2.5 text-[11px] text-tv-text-muted/50 hover:text-tv-text-muted active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        ⠿
      </div>

      <div className="no-scrollbar flex min-w-0 flex-1 items-stretch overflow-x-auto">
        <Sep />

        {/* Line drawings: color + width */}
        {!isPosition && (
          <>
            <Seg>
              <SwatchPicker
                value={drawing.color ?? "#2962ff"}
                onChange={(c) => patch({ color: c })}
              />
            </Seg>
            {/* Offered by kind, not by `"lineWidth" in drawing`: a fresh
                drawing has no width set, so that test hid the control on
                every new line and the width could never carry over. */}
            {WIDTH_KINDS.has(drawing.kind) && (
              <>
                <Sep />
                <Seg>
                  {(drawing.kind === "highlighter" ? [8, 14, 20, 28] : [1, 2, 3, 4]).map((w, i) => (
                    <button
                      key={w}
                      onClick={() => patch({ lineWidth: w })}
                      title={`Width ${w}`}
                      aria-pressed={drawing.lineWidth === w}
                      className={cn(
                        "flex h-5 w-5 [@media(hover:none)]:h-8 [@media(hover:none)]:w-8 items-center justify-center rounded",
                        drawing.lineWidth === w
                          ? "bg-tv-text/15 text-tv-text"
                          : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                      )}
                    >
                      <span
                        className="block w-3 rounded-full bg-current [@media(hover:none)]:w-4"
                        style={{ height: i + 1 }}
                      />
                    </button>
                  ))}
                </Seg>
              </>
            )}
            {LINE_STYLE_KINDS.has(drawing.kind) && (
              <>
                <Sep />
                <Seg>
                  {([0, 1, 2] as const).map((ls) => (
                    <button
                      key={ls}
                      onClick={() => patch({ lineStyle: ls })}
                      title={ls === 0 ? "Solid" : ls === 1 ? "Dashed" : "Dotted"}
                      aria-pressed={(drawing.lineStyle ?? 0) === ls}
                      className={cn(
                        "flex h-5 w-5 [@media(hover:none)]:h-8 [@media(hover:none)]:w-8 items-center justify-center rounded",
                        (drawing.lineStyle ?? 0) === ls
                          ? "bg-tv-text/15 text-tv-text"
                          : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                      )}
                    >
                      <svg viewBox="0 0 16 4" className="w-3.5 [@media(hover:none)]:w-[18px]" aria-hidden>
                        <line
                          x1="1" y1="2" x2="15" y2="2"
                          stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                          strokeDasharray={ls === 1 ? "4 3" : ls === 2 ? "0.1 3" : undefined}
                        />
                      </svg>
                    </button>
                  ))}
                </Seg>
              </>
            )}
          </>
        )}

        {/* Position drawings: E / S / T color pickers */}
        {isPosition && (
          <Seg gap>
            <MiniColorLabel label="E">
              <SwatchPicker
                value={drawing.color ?? "#d1d4dc"}
                onChange={(c) => patch({ color: c })}
              />
            </MiniColorLabel>
            <MiniColorLabel label="S">
              <SwatchPicker
                value={(drawing as { stopColor?: string }).stopColor ?? "#ef5350"}
                onChange={(c) => patch({ stopColor: c } as Partial<Drawing>)}
              />
            </MiniColorLabel>
            <MiniColorLabel label="T">
              <SwatchPicker
                value={(drawing as { targetColor?: string }).targetColor ?? "#26a69a"}
                onChange={(c) => patch({ targetColor: c } as Partial<Drawing>)}
              />
            </MiniColorLabel>
          </Seg>
        )}

        <Sep />

        {/* Common actions */}
        <Seg>
          <Btn title="Settings" onClick={onOpenSettings}>
            <Settings2 className="h-3.5 w-3.5 [@media(hover:none)]:h-[18px] [@media(hover:none)]:w-[18px]" />
          </Btn>
          <VisBtn drawing={drawing} onPatch={patch} />
          <LockBtn drawing={drawing} onPatch={patch} />
          <Btn title="Duplicate (Ctrl+D)" onClick={() => void duplicate(drawing.id)}>
            <Copy className="h-3.5 w-3.5 [@media(hover:none)]:h-[18px] [@media(hover:none)]:w-[18px]" />
          </Btn>
          <SaveAsDefaultButton drawing={drawing} />
          <TemplatesButton drawing={drawing} onApply={patch} />
          <Btn title="Delete" danger onClick={() => {
            void remove(drawing.id);
            useDrawingsStore.getState().setSelected(null);
          }}>
            <Trash2 className="h-3.5 w-3.5 [@media(hover:none)]:h-[18px] [@media(hover:none)]:w-[18px]" />
          </Btn>
        </Seg>

        {/* Create Limit Order from the long/short drawing */}
        {isPosition && <LimitOrderButton drawing={drawing} />}
      </div>
    </div>
  );
}

/* ── Primitives ─────────────────────────────────────────────────── */

function Sep() {
  return <div className="w-px shrink-0 self-stretch bg-tv-border" />;
}

function Seg({ children, gap }: { children: React.ReactNode; gap?: boolean }) {
  return (
    <div className={cn("flex shrink-0 items-center px-1 [@media(hover:none)]:px-1.5", gap && "gap-1.5")}>
      {children}
    </div>
  );
}

function Btn({
  children, title, onClick, danger,
}: {
  children: React.ReactNode; title: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-5 w-5 [@media(hover:none)]:h-8 [@media(hover:none)]:w-8 items-center justify-center rounded transition-colors",
        danger
          ? "text-tv-text-muted hover:bg-tv-red/15 hover:text-tv-red"
          : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
      )}
    >
      {children}
    </button>
  );
}

function VisBtn({ drawing, onPatch }: { drawing: Drawing; onPatch: (p: Partial<Drawing>) => void }) {
  const hidden = drawing.hidden ?? false;
  return (
    <button
      title={hidden ? "Show" : "Hide"}
      onClick={() => onPatch({ hidden: !hidden })}
      className="flex h-5 w-5 [@media(hover:none)]:h-8 [@media(hover:none)]:w-8 items-center justify-center rounded text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
    >
      {hidden ? <EyeOff className="h-3.5 w-3.5 [@media(hover:none)]:h-[18px] [@media(hover:none)]:w-[18px]" /> : <Eye className="h-3.5 w-3.5 [@media(hover:none)]:h-[18px] [@media(hover:none)]:w-[18px]" />}
    </button>
  );
}

function LockBtn({ drawing, onPatch }: { drawing: Drawing; onPatch: (p: Partial<Drawing>) => void }) {
  const locked = drawing.locked ?? false;
  return (
    <button
      title={locked ? "Unlock — allow moving" : "Lock — prevent moving"}
      onClick={() => onPatch({ locked: !locked })}
      className={cn(
        "flex h-5 w-5 [@media(hover:none)]:h-8 [@media(hover:none)]:w-8 items-center justify-center rounded transition-colors",
        locked
          ? "text-tv-blue hover:bg-tv-blue/15"
          : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
      )}
    >
      {locked ? <Lock className="h-3.5 w-3.5 [@media(hover:none)]:h-[18px] [@media(hover:none)]:w-[18px]" /> : <Unlock className="h-3.5 w-3.5 [@media(hover:none)]:h-[18px] [@media(hover:none)]:w-[18px]" />}
    </button>
  );
}

function MiniColorLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-px">
      {/* `leading-none`: the global 11px floor (see globals.css) turns this
          into an 11px label with a ~17px line box, and label + swatch then
          stood 2px taller than the touch-size bar — enough for the scroller
          to clip the letters off the top. */}
      <span className="text-[7px] font-bold uppercase leading-none tracking-wider text-tv-text-muted/60">{label}</span>
      {children}
    </div>
  );
}

/**
 * Wraps ColorPicker in a scaled-down container so the swatch fits the compact
 * bar height — but only where there is a mouse. A touch device gets the bar at
 * full size, so the swatch stays unscaled there too.
 */
function SwatchPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="scale-[0.78] [@media(hover:none)]:scale-100" style={{ transformOrigin: "center" }}>
      <ColorPicker value={value} onChange={onChange} />
    </div>
  );
}


/**
 * One-click "make this the default for the tool".
 *
 * Editing a style from this toolbar already writes `toolDefaults` field by
 * field, but that only ever captures the field just touched — a drawing whose
 * look was built up earlier (or imported, or restored from a template) has a
 * style the defaults have never seen. This copies the whole thing in a single
 * click, with none of the naming prompt a template needs; the matching
 * "Reset default style" lives in the templates menu, where an undo belongs.
 */
function SaveAsDefaultButton({ drawing }: { drawing: Drawing }) {
  const setToolDefault = useChartStore((s) => s.setToolDefault);
  const [saved, setSaved] = useState(false);

  // Reset the confirmation when the selection moves to another drawing, so a
  // stale check mark never suggests the new one was saved too.
  useEffect(() => {
    setSaved(false);
  }, [drawing.id]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(t);
  }, [saved]);

  return (
    <button
      title={saved ? "Saved as default" : "Save as default style for this tool"}
      onClick={() => {
        setToolDefault(
          drawing.kind,
          styleOf(drawing) as Parameters<typeof setToolDefault>[1],
        );
        setSaved(true);
      }}
      className={cn(
        "flex h-5 w-5 [@media(hover:none)]:h-8 [@media(hover:none)]:w-8 items-center justify-center rounded transition-colors",
        saved
          ? "text-tv-green"
          : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
      )}
    >
      {saved ? <Check className="h-3.5 w-3.5 [@media(hover:none)]:h-[18px] [@media(hover:none)]:w-[18px]" /> : <Pin className="h-3.5 w-3.5 [@media(hover:none)]:h-[18px] [@media(hover:none)]:w-[18px]" />}
    </button>
  );
}

/**
 * Named style presets for this drawing's kind — save the current style under
 * a name, and re-apply any saved one later. Unlike `toolDefaults` (the
 * single "last style used", applied silently to new drawings), templates are
 * explicit and applied on demand to the selected drawing.
 */
function TemplatesButton({
  drawing,
  onApply,
}: {
  drawing: Drawing;
  onApply: (p: Partial<Drawing>) => void;
}) {
  const templates = useChartStore((s) => s.drawingTemplates[drawing.kind] ?? NO_TEMPLATES);
  const saveDrawingTemplate = useChartStore((s) => s.saveDrawingTemplate);
  const deleteDrawingTemplate = useChartStore((s) => s.deleteDrawingTemplate);
  const clearToolDefault = useChartStore((s) => s.clearToolDefault);

  function saveTemplate() {
    const name = window.prompt("Template name:");
    if (name && name.trim()) {
      saveDrawingTemplate(drawing.kind, name.trim(), styleOf(drawing));
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="Templates"
        className="flex h-5 w-5 [@media(hover:none)]:h-8 [@media(hover:none)]:w-8 items-center justify-center rounded text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <Bookmark className="h-3.5 w-3.5 [@media(hover:none)]:h-[18px] [@media(hover:none)]:w-[18px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48 bg-tv-panel">
        <DropdownMenuItem onClick={saveTemplate} className="text-xs">
          <BookmarkPlus className="h-3.5 w-3.5 [@media(hover:none)]:h-[18px] [@media(hover:none)]:w-[18px]" />
          <span>Save as template…</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => clearToolDefault(drawing.kind)}
          className="text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5 [@media(hover:none)]:h-[18px] [@media(hover:none)]:w-[18px]" />
          <span>Reset default style</span>
        </DropdownMenuItem>
        {templates.length > 0 && <DropdownMenuSeparator />}
        {templates.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => onApply(t.style as Partial<Drawing>)}
            className="text-xs"
          >
            <span className="min-w-0 flex-1 truncate">{t.name}</span>
            <span
              role="button"
              aria-label="Delete template"
              title="Delete template"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteDrawingTemplate(drawing.kind, t.id);
              }}
              className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded text-tv-text-dim hover:bg-tv-panel-hover hover:text-tv-red"
            >
              <X className="h-3 w-3" />
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Pre-fills the OrderPanel with the long/short drawing's entry / stop /
 * target and opens the right sidebar so the user can confirm the qty + submit.
 *
 * If no API credentials are set we disable the button and prompt to connect.
 */
function LimitOrderButton({ drawing }: { drawing: Drawing }) {
  const apiKey = useTradingStore((s) => s.apiKey);
  const apiSecret = useTradingStore((s) => s.apiSecret);
  const updateForm = useTradingStore((s) => s.updateForm);
  const setTradingPanelOpen = useTradingStore((s) => s.setTradingPanelOpen);
  const connected = apiKey && apiSecret;

  function onClick() {
    if (!connected) return;
    if (drawing.kind !== "long" && drawing.kind !== "short") return;
    const isLong = drawing.kind === "long";
    updateForm({
      side: isLong ? "BUY" : "SELL",
      type: "LIMIT",
      price: drawing.entry.toString(),
      stopPrice: "",
      slEnabled: true,
      sl: drawing.stop.toString(),
      tpEnabled: true,
      tp: drawing.target.toString(),
    });
    setTradingPanelOpen(true);
  }

  return (
    <>
      <Sep />
      <Seg>
        <button
          disabled={!connected}
          onClick={onClick}
          title={connected
            ? "Pre-fill the order panel with this drawing's E/S/T"
            : "Connect an exchange to create orders"}
          className={cn(
            "flex items-center gap-1 rounded px-1.5 text-[10px] font-medium transition-colors",
            connected
              ? "text-tv-blue hover:bg-tv-blue/15"
              : "text-tv-text-muted/40",
          )}
        >
          <TrendingUp className="h-3 w-3" />
          <span>Limit order</span>
        </button>
      </Seg>
    </>
  );
}
