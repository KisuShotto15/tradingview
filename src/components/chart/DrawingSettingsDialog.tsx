"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/ui/color-picker";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawings } from "@/lib/supabase/use-drawings";
import type { Drawing } from "@/lib/drawings/types";
import { cn } from "@/lib/utils";

const KIND_TITLE: Record<string, string> = {
  hline: "Horizontal line",
  vline: "Vertical line",
  hray: "Horizontal ray",
  trendline: "Trendline",
  ray: "Ray",
  "parallel-channel": "Parallel channel",
  "fib-retracement": "Fibonacci retracement",
  "price-range": "Price range",
  "date-range": "Date range",
  long: "Long position",
  short: "Short position",
};

type Tab = "style" | "coordinates" | "visibility";

export function DrawingSettingsDialog() {
  const editingId = useDrawingsStore((s) => s.editingId);
  const setEditing = useDrawingsStore((s) => s.setEditing);
  const drawings = useDrawingsStore((s) => s.drawings);
  const setToolDefault = useChartStore((s) => s.setToolDefault);
  const { update, remove } = useDrawings();

  const drawing = drawings.find((d) => d.id === editingId) ?? null;
  const open = drawing !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && setEditing(null)}>
      <DialogContent className="max-w-sm bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {drawing ? KIND_TITLE[drawing.kind] ?? drawing.kind : ""}
          </DialogTitle>
        </DialogHeader>
        {drawing && (
          <Form
            drawing={drawing}
            onApply={(patch) => {
              void update(drawing.id, patch);
              // Persist the style as default for this tool
              const stylePatch: {
                color?: string;
                lineWidth?: number;
              } = {};
              if (patch.color !== undefined) stylePatch.color = patch.color;
              if (patch.lineWidth !== undefined)
                stylePatch.lineWidth = patch.lineWidth;
              if (Object.keys(stylePatch).length > 0) {
                setToolDefault(drawing.kind, stylePatch);
              }
              setEditing(null);
            }}
            onDelete={() => {
              void remove(drawing.id);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Form({
  drawing,
  onApply,
  onDelete,
  onCancel,
}: {
  drawing: Drawing;
  onApply: (patch: Partial<Drawing>) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<Tab>("style");
  const [color, setColor] = useState<string>(drawing.color ?? "#2962ff");
  const [lineWidth, setLineWidth] = useState<number>(drawing.lineWidth ?? 1);

  useEffect(() => {
    setColor(drawing.color ?? "#2962ff");
    setLineWidth(drawing.lineWidth ?? 1);
  }, [drawing]);

  function apply() {
    const patch: Partial<Drawing> = {} as Partial<Drawing>;
    patch.color = color;
    patch.lineWidth = lineWidth;
    onApply(patch);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Tabs */}
      <div className="flex border-b border-tv-border">
        {(["style", "coordinates"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              tab === t
                ? "border-b-2 border-tv-blue text-tv-text"
                : "text-tv-text-muted hover:text-tv-text",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "style" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-tv-text">Color</span>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-tv-text">Line width</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map((w) => (
                <button
                  key={w}
                  onClick={() => setLineWidth(w)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded border text-[10px]",
                    lineWidth === w
                      ? "border-tv-blue bg-tv-blue/15 text-tv-blue"
                      : "border-tv-border text-tv-text-muted hover:bg-tv-panel-hover",
                  )}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-tv-text-muted">
            Color and line width are saved as defaults for the next
            {" "}
            {KIND_TITLE[drawing.kind]?.toLowerCase() ?? drawing.kind}.
          </p>
        </div>
      )}

      {tab === "coordinates" && <CoordinatesTab drawing={drawing} onApply={onApply} />}

      <div className="mt-2 flex items-center justify-between border-t border-tv-border pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-tv-red hover:bg-tv-red/10 hover:text-tv-red"
        >
          Delete
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-tv-text-muted hover:text-tv-text"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={apply}
            className="bg-tv-blue hover:bg-tv-blue/90"
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

function CoordinatesTab({
  drawing,
  onApply,
}: {
  drawing: Drawing;
  onApply: (patch: Partial<Drawing>) => void;
}) {
  // Show editable price fields for whatever anchors the drawing has
  // (per-kind, since the data model is a discriminated union)
  switch (drawing.kind) {
    case "hline":
      return (
        <PriceField
          label="Price"
          value={drawing.price}
          onChange={(v) => onApply({ price: v } as Partial<Drawing>)}
        />
      );
    case "hray":
      return (
        <PriceField
          label="Price"
          value={drawing.anchor.price}
          onChange={(v) =>
            onApply({
              anchor: { ...drawing.anchor, price: v },
            } as Partial<Drawing>)
          }
        />
      );
    case "trendline":
    case "ray":
    case "fib-retracement":
      return (
        <div className="flex flex-col gap-2">
          <PriceField
            label="Price A"
            value={drawing.a.price}
            onChange={(v) =>
              onApply({ a: { ...drawing.a, price: v } } as Partial<Drawing>)
            }
          />
          <PriceField
            label="Price B"
            value={drawing.b.price}
            onChange={(v) =>
              onApply({ b: { ...drawing.b, price: v } } as Partial<Drawing>)
            }
          />
        </div>
      );
    case "long":
    case "short":
      return (
        <div className="flex flex-col gap-2">
          <PriceField
            label="Entry"
            value={drawing.entry}
            onChange={(v) => onApply({ entry: v } as Partial<Drawing>)}
          />
          <PriceField
            label="Stop"
            value={drawing.stop}
            onChange={(v) => onApply({ stop: v } as Partial<Drawing>)}
          />
          <PriceField
            label="Target"
            value={drawing.target}
            onChange={(v) => onApply({ target: v } as Partial<Drawing>)}
          />
        </div>
      );
    case "price-range":
      return (
        <div className="flex flex-col gap-2">
          <PriceField
            label="Price A"
            value={drawing.priceA}
            onChange={(v) => onApply({ priceA: v } as Partial<Drawing>)}
          />
          <PriceField
            label="Price B"
            value={drawing.priceB}
            onChange={(v) => onApply({ priceB: v } as Partial<Drawing>)}
          />
        </div>
      );
    default:
      return (
        <p className="text-xs text-tv-text-muted">
          Coordinate editing not available for this drawing.
        </p>
      );
  }
}

function PriceField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(value.toString());
  useEffect(() => {
    setDraft(value.toString());
  }, [value]);
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs text-tv-text">{label}</span>
      <Input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseFloat(draft);
          if (!isNaN(n)) onChange(n);
        }}
        className="w-32 bg-tv-bg text-right tabular-nums"
      />
    </label>
  );
}
