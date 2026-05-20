"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Eye, EyeOff, Settings2, Trash2, TrendingUp } from "lucide-react";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { ColorPicker } from "@/components/ui/color-picker";
import { cn } from "@/lib/utils";
import type { Drawing } from "@/lib/drawings/types";

interface Props {
  containerSize: { width: number; height: number };
  /** Called to open the settings dialog for the selected drawing */
  onOpenSettings: () => void;
}

export function FloatingContextToolbar({ containerSize, onOpenSettings }: Props) {
  const selectedId = useDrawingsStore((s) => s.selectedId);
  const drawings = useDrawingsStore((s) => s.drawings);
  const drawing = selectedId ? drawings.find((d) => d.id === selectedId) ?? null : null;

  const { update, remove } = useDrawings();

  // Toolbar position (relative to chart container). Starts off-screen.
  const [pos, setPos] = useState({ x: -9999, y: 12 });
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // After the toolbar renders (width known), snap to top-right corner on new selection
  const prevIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!selectedId || selectedId === prevIdRef.current) return;
    prevIdRef.current = selectedId;
    const tw = toolbarRef.current?.offsetWidth ?? 0;
    setPos({ x: Math.max(0, containerSize.width - tw - 16), y: 12 });
  });

  // Keep toolbar inside container when it resizes
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    setPos((p) => ({
      x: Math.min(p.x, Math.max(0, containerSize.width - tw)),
      y: Math.min(p.y, Math.max(0, containerSize.height - th)),
    }));
  }, [containerSize]);

  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: pos.x, py: pos.y };
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.ox;
    const dy = e.clientY - dragRef.current.oy;
    const tw = toolbarRef.current?.offsetWidth ?? 0;
    const th = toolbarRef.current?.offsetHeight ?? 0;
    setPos({
      x: Math.max(0, Math.min(dragRef.current.px + dx, containerSize.width - tw)),
      y: Math.max(0, Math.min(dragRef.current.py + dy, containerSize.height - th)),
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  if (!drawing) return null;

  const isPosition = drawing.kind === "long" || drawing.kind === "short";

  function patchDrawing(patch: Partial<Drawing>) {
    void update(drawing!.id, patch);
  }

  return (
    <div
      ref={toolbarRef}
      className="pointer-events-auto absolute z-30 flex items-stretch overflow-visible rounded-md border border-tv-border bg-tv-panel shadow-xl"
      style={{ left: pos.x, top: pos.y, userSelect: "none" }}
      // Prevent chart click-through
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Drag handle */}
      <div
        className="flex cursor-grab items-center px-2 text-tv-text-muted/60 hover:text-tv-text-muted active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        ⠿
      </div>

      <div className="w-px self-stretch bg-tv-border" />

      {/* === Line-style drawings: single color + line width === */}
      {!isPosition && (
        <>
          <ToolSection>
            <ColorPicker
              value={drawing.color ?? "#2962ff"}
              onChange={(c) => patchDrawing({ color: c })}
            />
          </ToolSection>

          {"lineWidth" in drawing && (
            <>
              <div className="w-px self-stretch bg-tv-border" />
              <ToolSection>
                {[1, 2, 3].map((w) => (
                  <button
                    key={w}
                    onClick={() => patchDrawing({ lineWidth: w })}
                    title={`Line width ${w}`}
                    className={cn(
                      "flex h-7 w-6 items-center justify-center rounded text-[10px] font-semibold",
                      (drawing.lineWidth ?? 1) === w
                        ? "bg-tv-blue/20 text-tv-blue"
                        : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                    )}
                  >
                    {w}
                  </button>
                ))}
              </ToolSection>
            </>
          )}
        </>
      )}

      {/* === Position drawings: three color pickers === */}
      {isPosition && (
        <ToolSection gap>
          <ColorLabel label="E">
            <ColorPicker
              value={drawing.color ?? "#d1d4dc"}
              onChange={(c) => patchDrawing({ color: c })}
            />
          </ColorLabel>
          <ColorLabel label="S">
            <ColorPicker
              value={(drawing as { stopColor?: string }).stopColor ?? "#ef5350"}
              onChange={(c) => patchDrawing({ stopColor: c } as Partial<Drawing>)}
            />
          </ColorLabel>
          <ColorLabel label="T">
            <ColorPicker
              value={(drawing as { targetColor?: string }).targetColor ?? "#26a69a"}
              onChange={(c) => patchDrawing({ targetColor: c } as Partial<Drawing>)}
            />
          </ColorLabel>
        </ToolSection>
      )}

      <div className="w-px self-stretch bg-tv-border" />

      {/* === Common actions === */}
      <ToolSection>
        <IconBtn title="Settings" onClick={onOpenSettings}>
          <Settings2 className="h-4 w-4" />
        </IconBtn>
        <VisibilityBtn drawing={drawing} onPatch={patchDrawing} />
        <IconBtn
          title="Delete"
          onClick={() => {
            void remove(drawing.id);
            useDrawingsStore.getState().setSelected(null);
          }}
          danger
        >
          <Trash2 className="h-4 w-4" />
        </IconBtn>
      </ToolSection>

      {/* === Create Limit Order (position only) === */}
      {isPosition && (
        <>
          <div className="w-px self-stretch bg-tv-border" />
          <ToolSection>
            <button
              disabled
              title="Connect an exchange to create orders automatically"
              className="flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium text-tv-text-muted/50 transition-colors"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Create limit order</span>
            </button>
          </ToolSection>
        </>
      )}
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────── */

function ToolSection({
  children,
  gap,
}: {
  children: React.ReactNode;
  gap?: boolean;
}) {
  return (
    <div className={cn("flex items-center px-1.5 py-1", gap && "gap-2")}>
      {children}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded transition-colors",
        danger
          ? "text-tv-text-muted hover:bg-tv-red/15 hover:text-tv-red"
          : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
      )}
    >
      {children}
    </button>
  );
}

function ColorLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[8px] font-semibold uppercase tracking-wider text-tv-text-muted/70">
        {label}
      </span>
      {children}
    </div>
  );
}

function VisibilityBtn({
  drawing,
  onPatch,
}: {
  drawing: Drawing;
  onPatch: (p: Partial<Drawing>) => void;
}) {
  // Drawings don't have a first-class `hidden` field in the base type,
  // but some may. For now, this toggles an extended field via cast.
  const hidden = drawing.hidden ?? false;
  return (
    <button
      title={hidden ? "Show" : "Hide"}
      onClick={() => onPatch({ hidden: !hidden } as Partial<Drawing>)}
      className="flex h-7 w-7 items-center justify-center rounded text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
    >
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}
