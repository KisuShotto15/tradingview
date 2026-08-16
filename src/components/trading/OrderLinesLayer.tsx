"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { useTradingStore } from "@/lib/store/trading-store";
import { useChartStore } from "@/lib/store/chart-store";
import { isPerp, cleanSym } from "@/lib/binance/rest";
import { formatPrice } from "@/lib/format";
import type { Order } from "@/lib/binance/trading-types";

/** Bybit-style colors. Limit is always blue regardless of side. */
const LIMIT_COLOR = "#2962ff";
const TP_COLOR = "#26a69a";
const SL_COLOR = "#fbc02d";
const LIQ_COLOR = "#ff5252";

interface Props {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  container: HTMLElement | null;
  width: number;
  mainPaneHeight: number;
  renderTick: number;
}

interface LineSpec {
  kind: "LIMIT" | "TP" | "SL" | "LIQ";
  /** Stable identity for two-step (drag → confirm) editable lines. */
  id?: string;
  price: number;
  /** Quantity in base asset shown on the pill. */
  qty: number;
  /** Side of the parent order — drives the +/- sign of P&L on TP/SL. */
  side: "BUY" | "SELL";
  /** Optional anchor entry price used to compute USD P&L for TP/SL pills. */
  entryPrice?: number;
  /** Live unrealized P&L in USD (open positions only) shown on the EP pill. */
  livePnl?: number;
  /** Live unrealized P&L in percent (open positions only). */
  livePct?: number;
  /** Drag handler. If undefined the line is read-only. */
  onDrag?: (price: number) => void;
  /** Optional commit when drag ends — used by drag-to-modify on open orders. */
  onCommit?: (price: number) => void;
  /** Two-step commit: called when the user confirms a pending dragged change. */
  confirm?: (price: number) => Promise<void> | void;
  /** Optional close action — renders a close (×) button on the line (EP line). */
  onClose?: () => void;
  /** When true, render the line in a "modifying…" muted style. */
  modifying?: boolean;
  /** When true, the line represents an OPEN POSITION (uses "EP" label and
   *  solid styling). Distinguishes from a pending limit order. */
  isPosition?: boolean;
}

function colorOf(kind: LineSpec["kind"]): string {
  switch (kind) {
    case "LIMIT": return LIMIT_COLOR;
    case "TP":    return TP_COLOR;
    case "SL":    return SL_COLOR;
    case "LIQ":   return LIQ_COLOR;
  }
}

function pillText(line: LineSpec): { left: string; right: string } {
  const qtyStr = line.qty > 0 ? line.qty.toString() : "";
  if (line.kind === "LIQ") {
    return { left: "Liq.", right: formatPrice(line.price) };
  }
  if (line.kind === "LIMIT") {
    if (line.isPosition) {
      // Open position line: side + qty on the left, live PnL (USD + %) on the right.
      const pnl =
        line.livePnl !== undefined
          ? `${line.livePnl >= 0 ? "+" : "−"}${Math.abs(line.livePnl).toFixed(2)} USD`
          : "";
      const pct =
        line.livePct !== undefined
          ? ` (${line.livePct >= 0 ? "+" : ""}${line.livePct.toFixed(2)}%)`
          : "";
      return {
        left: `${line.side === "BUY" ? "Long" : "Short"} ${qtyStr}`.trim(),
        right: `${pnl}${pct}`,
      };
    }
    return {
      left: `${line.side} ${qtyStr}`.trim(),
      right: `Limit ${formatPrice(line.price)}`,
    };
  }
  if (line.entryPrice && line.qty > 0) {
    const pnl =
      line.kind === "TP"
        ? Math.abs(line.price - line.entryPrice) * line.qty
        : Math.abs(line.entryPrice - line.price) * line.qty;
    const sign = line.kind === "TP" ? "+" : "−";
    return {
      left: qtyStr,
      right: `${sign}${pnl.toFixed(2)} USD`,
    };
  }
  return {
    left: line.kind,
    right: formatPrice(line.price),
  };
}

interface DragState {
  onDrag: (p: number) => void;
  onCommit?: (p: number) => void;
  lastPrice: number;
}

function LineRow({
  line, y, width, modifying, pending, onMouseDown, onDiscard, onConfirm,
}: {
  line: LineSpec;
  y: number;
  width: number;
  modifying: boolean;
  pending: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDiscard?: () => void;
  onConfirm?: () => void;
}) {
  const color = colorOf(line.kind);
  // Open-position lines (EP/SL/TP/liq) are solid like TradingView; only pending
  // orders and form previews stay dashed.
  const dashed = !line.isPosition && line.kind !== "LIMIT";
  const { left, right } = pillText(line);
  const label = modifying ? "Modifying…" : `${left} · ${right}`;
  const labelW = Math.max(label.length * 6.2 + 14, 90);
  const hasClose = !!line.onClose && !modifying;
  const closeW = hasClose ? 18 : 0;
  const textColor = line.kind === "SL" ? "#000" : "#fff";
  // Right edge of the pill group (leaves room for the close button after it).
  const pillRight = width - closeW - 2;

  // Discard / Confirm controls sit just left of the pill while a change is pending.
  const DISCARD_W = 58;
  const CONFIRM_W = 58;
  const BTN_GAP = 4;
  const confirmX = pillRight - labelW - BTN_GAP - CONFIRM_W;
  const discardX = confirmX - BTN_GAP - DISCARD_W;

  return (
    <g style={{ opacity: modifying ? 0.55 : 1 }}>
      {/* Hit area for drag */}
      <line
        x1={0}
        x2={width}
        y1={y}
        y2={y}
        stroke="transparent"
        strokeWidth={10}
        style={{
          pointerEvents: line.onDrag ? "stroke" : "none",
          cursor: line.onDrag ? "ns-resize" : "default",
        }}
        onMouseDown={onMouseDown}
      />
      {/* Visible line */}
      <line
        x1={0}
        x2={(pending ? discardX : pillRight - labelW) - 4}
        y1={y}
        y2={y}
        stroke={color}
        strokeWidth={line.isPosition && line.kind === "LIMIT" ? 1.6 : 1.2}
        strokeDasharray={dashed ? "5,4" : undefined}
        style={{ pointerEvents: "none" }}
      />
      {/* Label pill */}
      <g style={{ pointerEvents: "none" }}>
        <rect
          x={pillRight - labelW}
          y={y - 9}
          width={labelW}
          height={18}
          fill={color}
          rx={2}
        />
        <text
          x={pillRight - labelW / 2}
          y={y + 4}
          fill={textColor}
          fontSize={10}
          fontFamily="var(--font-mono), monospace"
          textAnchor="middle"
        >
          {label}
        </text>
      </g>
      {/* Discard / Confirm (pending dragged change) */}
      {pending && (
        <g style={{ pointerEvents: "all" }}>
          <g
            style={{ cursor: "pointer" }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDiscard?.(); }}
          >
            <rect x={discardX} y={y - 9} width={DISCARD_W} height={18} rx={3} fill="#2a2e39" stroke="#434651" />
            <text x={discardX + DISCARD_W / 2} y={y + 4} fill="#d1d4dc" fontSize={10} textAnchor="middle">
              Discard
            </text>
          </g>
          <g
            style={{ cursor: "pointer" }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onConfirm?.(); }}
          >
            <rect x={confirmX} y={y - 9} width={CONFIRM_W} height={18} rx={3} fill={LIMIT_COLOR} />
            <text x={confirmX + CONFIRM_W / 2} y={y + 4} fill="#fff" fontSize={10} fontWeight="bold" textAnchor="middle">
              Confirm
            </text>
          </g>
        </g>
      )}
      {/* Close button (open positions) */}
      {hasClose && (
        <g
          style={{ pointerEvents: "all", cursor: "pointer" }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            line.onClose?.();
          }}
        >
          <rect x={width - 18} y={y - 9} width={16} height={18} fill={color} rx={2} />
          <text
            x={width - 10}
            y={y + 4}
            fill={textColor}
            fontSize={12}
            fontWeight="bold"
            textAnchor="middle"
          >
            ×
          </text>
        </g>
      )}
    </g>
  );
}

export function OrderLinesLayer({
  chart,
  candleSeries,
  container,
  width,
  mainPaneHeight,
  renderTick,
}: Props) {
  const symbol = useChartStore((s) => s.symbol);
  const tradingPanelOpen = useTradingStore((s) => s.tradingPanelOpen);
  const form = useTradingStore((s) => s.form);
  const orders = useTradingStore((s) => s.orders);
  const positions = useTradingStore((s) => s.positions);
  const updateForm = useTradingStore((s) => s.updateForm);
  const modifyOrder = useTradingStore((s) => s.modifyOrder);
  const setPositionTpSl = useTradingStore((s) => s.setPositionTpSl);
  const closePosition = useTradingStore((s) => s.closePosition);
  const modifyingOrderId = useTradingStore((s) => s.modifyingOrderId);

  // `renderTick` is already a prop from PriceChart — receiving it as a prop
  // re-renders this component on every chart pan/zoom without an extra hook.
  void renderTick;

  const dragRef = useRef<DragState | null>(null);
  // Two-step edit for position TP/SL: `preview` follows the cursor while held;
  // on release it becomes `pending` (Discard/Confirm) until the user confirms.
  const [preview, setPreview] = useState<{ id: string; price: number } | null>(null);
  const [pending, setPending] = useState<{ id: string; price: number } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current || !candleSeries || !container) return;
      const rect = container.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const price = candleSeries.coordinateToPrice(relY);
      if (price !== null) {
        const p = price as number;
        dragRef.current.lastPrice = p;
        dragRef.current.onDrag(p);
      }
    }
    function onUp() {
      const s = dragRef.current;
      dragRef.current = null;
      if (s?.onCommit && isFinite(s.lastPrice)) s.onCommit(s.lastPrice);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [candleSeries, container]);

  function startDrag(
    e: React.MouseEvent,
    onDrag: (price: number) => void,
    onCommit?: (price: number) => void,
  ) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { onDrag, onCommit, lastPrice: NaN };
  }

  if (!chart || !candleSeries) return null;

  const perp = isPerp(symbol);
  const lines: LineSpec[] = [];
  const zones: { y1: number; y2: number; color: string; opacity: number }[] = [];

  /* ── Preview lines from the form (while the panel is open) ───────── */
  const entryPrice = parseFloat(form.price);
  const slPrice = parseFloat(form.sl);
  const tpPrice = parseFloat(form.tp);
  const qtyNum = parseFloat(form.qty);

  const hasPreviewEntry = tradingPanelOpen && form.type !== "MARKET" && entryPrice > 0;
  const hasPreviewSL = tradingPanelOpen && perp && form.slEnabled && slPrice > 0;
  const hasPreviewTP = tradingPanelOpen && perp && form.tpEnabled && tpPrice > 0;

  if (hasPreviewEntry) {
    lines.push({
      kind: "LIMIT",
      price: entryPrice,
      qty: qtyNum || 0,
      side: form.side,
      onDrag: (p) => updateForm({ price: p.toFixed(2) }),
    });
  }
  if (hasPreviewTP) {
    lines.push({
      kind: "TP",
      price: tpPrice,
      qty: qtyNum || 0,
      side: form.side,
      entryPrice: entryPrice || undefined,
      onDrag: (p) => updateForm({ tp: p.toFixed(2) }),
    });
  }
  if (hasPreviewSL) {
    lines.push({
      kind: "SL",
      price: slPrice,
      qty: qtyNum || 0,
      side: form.side,
      entryPrice: entryPrice || undefined,
      onDrag: (p) => updateForm({ sl: p.toFixed(2) }),
    });
  }

  /* ── Lines for open orders on the exchange ──────────────────────── */
  for (const order of orders) {
    const price = order.stopPrice ?? order.price;
    if (!price || price <= 0) continue;
    const kind: LineSpec["kind"] =
      order.type === "TAKE_PROFIT_MARKET" || order.type === "TAKE_PROFIT"
        ? "TP"
        : order.type === "STOP_MARKET" || order.type === "STOP" || order.type === "STOP_LIMIT"
          ? "SL"
          : "LIMIT";

    const live = (p: number) => {
      // Update form so the panel input mirrors the dragging line if it
      // happens to be the same kind. No commit yet — that fires on mouseup.
      void p;
    };
    const commit = async (p: number) => {
      const newPrice = Math.abs(p - price) < 1e-9 ? price : p;
      if (newPrice === price) return;
      await modifyOrder(symbol, order as Order, newPrice);
    };

    lines.push({
      kind,
      price,
      qty: order.origQty,
      side: order.side,
      entryPrice: undefined,
      onDrag: live,
      onCommit: commit,
      modifying: modifyingOrderId === order.orderId,
    });
  }

  /* ── Lines for open positions on the exchange ───────────────────── */
  const cleanedSym = cleanSym(symbol);
  for (const pos of positions) {
    if (pos.positionAmt === 0 || pos.symbol !== cleanedSym) continue;
    const isLong = pos.positionAmt > 0;
    const posSide: "BUY" | "SELL" = isLong ? "BUY" : "SELL";
    const closeSide: "BUY" | "SELL" = isLong ? "SELL" : "BUY";
    const qty = Math.abs(pos.positionAmt);

    // Entry line (read-only price, but carries live PnL + a close button).
    lines.push({
      kind: "LIMIT",
      price: pos.entryPrice,
      qty,
      side: posSide,
      isPosition: true,
      livePnl: pos.unrealizedProfit,
      livePct: pos.percentage,
      onClose: () => void closePosition(symbol, pos),
    });

    // Liquidation line (read-only).
    if (pos.liquidationPrice > 0) {
      lines.push({
        kind: "LIQ",
        price: pos.liquidationPrice,
        qty,
        side: posSide,
        isPosition: true,
      });
    }

    // TP / SL: prefer the values attached to the position (Bybit), otherwise
    // fall back to matching reduceOnly orders (Binance).
    const tpOrder = orders.find(
      (o) => o.symbol === cleanedSym && o.side === closeSide && o.reduceOnly &&
        (o.type === "TAKE_PROFIT_MARKET" || o.type === "TAKE_PROFIT"),
    );
    const slOrder = orders.find(
      (o) => o.symbol === cleanedSym && o.side === closeSide && o.reduceOnly &&
        (o.type === "STOP_MARKET" || o.type === "STOP" || o.type === "STOP_LIMIT"),
    );
    const tpPrice = pos.takeProfit ?? tpOrder?.stopPrice ?? null;
    const slPrice = pos.stopLoss ?? slOrder?.stopPrice ?? null;

    if (tpPrice && tpPrice > 0) {
      const id = `${cleanedSym}-TP`;
      lines.push({
        kind: "TP",
        id,
        price: tpPrice,
        qty,
        side: posSide,
        entryPrice: pos.entryPrice,
        isPosition: true,
        onDrag: (p) => setPreview({ id, price: p }),
        onCommit: (p) => {
          setPreview(null);
          if (Math.abs(p - tpPrice) > 1e-9) setPending({ id, price: p });
        },
        confirm: async (p) => { await setPositionTpSl(symbol, pos, { tp: p }); },
        modifying: modifyingOrderId === tpOrder?.orderId,
      });
    }
    if (slPrice && slPrice > 0) {
      const id = `${cleanedSym}-SL`;
      lines.push({
        kind: "SL",
        id,
        price: slPrice,
        qty,
        side: posSide,
        entryPrice: pos.entryPrice,
        isPosition: true,
        onDrag: (p) => setPreview({ id, price: p }),
        onCommit: (p) => {
          setPreview(null);
          if (Math.abs(p - slPrice) > 1e-9) setPending({ id, price: p });
        },
        confirm: async (p) => { await setPositionTpSl(symbol, pos, { sl: p }); },
        modifying: modifyingOrderId === slOrder?.orderId,
      });
    }

    // Shaded zones for the open position (entry↔TP green, entry↔SL red). While a
    // line is being dragged/pending, the zone tracks its effective price.
    const tpId = `${cleanedSym}-TP`;
    const slId = `${cleanedSym}-SL`;
    const effOf = (id: string, base: number | null) =>
      preview?.id === id ? preview.price : pending?.id === id ? pending.price : base;
    const effTp = effOf(tpId, tpPrice);
    const effSl = effOf(slId, slPrice);
    const yEntryPos = candleSeries.priceToCoordinate(pos.entryPrice);
    if (yEntryPos !== null) {
      if (effTp && effTp > 0) {
        const yTp = candleSeries.priceToCoordinate(effTp);
        if (yTp !== null) {
          zones.push({
            y1: Math.min(yEntryPos as number, yTp as number),
            y2: Math.max(yEntryPos as number, yTp as number),
            color: TP_COLOR,
            opacity: 0.07,
          });
        }
      }
      if (effSl && effSl > 0) {
        const ySl = candleSeries.priceToCoordinate(effSl);
        if (ySl !== null) {
          zones.push({
            y1: Math.min(yEntryPos as number, ySl as number),
            y2: Math.max(yEntryPos as number, ySl as number),
            color: SL_COLOR,
            opacity: 0.06,
          });
        }
      }
    }
  }

  /* ── Shaded zones for the form preview (entry↔TP and entry↔SL) ── */
  if (hasPreviewEntry) {
    const yEntry = candleSeries.priceToCoordinate(entryPrice);
    if (yEntry !== null) {
      if (hasPreviewTP) {
        const yTp = candleSeries.priceToCoordinate(tpPrice);
        if (yTp !== null) {
          zones.push({
            y1: Math.min(yEntry as number, yTp as number),
            y2: Math.max(yEntry as number, yTp as number),
            color: TP_COLOR,
            opacity: 0.10,
          });
        }
      }
      if (hasPreviewSL) {
        const ySl = candleSeries.priceToCoordinate(slPrice);
        if (ySl !== null) {
          zones.push({
            y1: Math.min(yEntry as number, ySl as number),
            y2: Math.max(yEntry as number, ySl as number),
            color: SL_COLOR,
            opacity: 0.08,
          });
        }
      }
    }
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      style={{ overflow: "visible" }}
    >
      <defs>
        <clipPath id="order-lines-clip">
          <rect x={0} y={0} width={width} height={mainPaneHeight} />
        </clipPath>
      </defs>
      <g clipPath="url(#order-lines-clip)" style={{ pointerEvents: "all" }}>
        {/* Background shaded zones — drawn first so lines render on top */}
        {zones.map((z, i) => (
          <rect
            key={`zone-${i}`}
            x={0}
            y={z.y1}
            width={width}
            height={Math.max(0, z.y2 - z.y1)}
            fill={z.color}
            opacity={z.opacity}
            style={{ pointerEvents: "none" }}
          />
        ))}

        {/* Lines */}
        {lines.map((line, i) => {
          // While dragging (preview) or awaiting confirmation (pending), draw the
          // line at the dragged price instead of the stored one.
          const isPending = !!line.id && pending?.id === line.id;
          const effPrice =
            line.id && preview?.id === line.id
              ? preview.price
              : isPending
                ? (pending as { price: number }).price
                : line.price;
          const renderLine = effPrice === line.price ? line : { ...line, price: effPrice };
          const y = candleSeries.priceToCoordinate(effPrice);
          if (y === null) return null;
          const yPx = y as number;
          if (yPx < 0 || yPx > mainPaneHeight) return null;
          return (
            <LineRow
              key={line.id ?? `line-${i}-${line.kind}`}
              line={renderLine}
              y={yPx}
              width={width}
              modifying={line.modifying ?? false}
              pending={isPending}
              onMouseDown={(e) => {
                if (line.onDrag) startDrag(e, line.onDrag, line.onCommit);
              }}
              onDiscard={() => setPending(null)}
              onConfirm={() => {
                const pr = (pending as { price: number }).price;
                setPending(null);
                void line.confirm?.(pr);
              }}
            />
          );
        })}
      </g>
    </svg>
  );
}
