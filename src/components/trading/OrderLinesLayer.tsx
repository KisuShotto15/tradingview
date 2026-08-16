"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, IPriceLine } from "lightweight-charts";
import { useTradingStore } from "@/lib/store/trading-store";
import { useChartStore } from "@/lib/store/chart-store";
import { isPerp, cleanSym } from "@/lib/binance/rest";
import { formatPrice } from "@/lib/format";
import type { Order, Position } from "@/lib/binance/trading-types";

/** Bybit-style colors. Limit is always blue regardless of side. */
const LIMIT_COLOR = "#2962ff";
const TP_COLOR = "#26a69a";
const SL_COLOR = "#fbc02d";
const LIQ_COLOR = "#ff5252";
/** Gap kept between the labels/toolbar and the price scale on the right. */
const AXIS_GAP = 48;

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
  /** Optional remove action — renders a small × chip that clears this value
   *  entirely (e.g. clear the SL). */
  onRemove?: () => void;
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
    // Only the USD amount on TP/SL pills — the size lives on the entry toolbar.
    return {
      left: "",
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
  line, y, width, modifying, onMouseDown,
}: {
  line: LineSpec;
  y: number;
  width: number;
  modifying: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const color = colorOf(line.kind);
  // Open-position lines (EP/SL/TP/liq) are solid like TradingView; only pending
  // orders and form previews stay dashed.
  const dashed = !line.isPosition && line.kind !== "LIMIT";
  const { left, right } = pillText(line);
  const label = modifying ? "Modifying…" : [left, right].filter(Boolean).join(" · ");
  const labelW = Math.max(label.length * 6.2 + 14, 90);
  // Only one action button applies per line in practice (onRemove for SL/TP,
  // onClose reserved for future use) — prefer onRemove.
  const action = !modifying ? (line.onRemove ?? line.onClose) : undefined;
  const hasAction = !!action;
  const actionW = hasAction ? 18 : 0;
  // SL pills are outlined: black fill, yellow border + yellow text. Others use a
  // solid colored fill with light text.
  const outlined = line.kind === "SL";
  const pillFill = outlined ? "#0a0a0a" : color;
  const pillStroke = outlined ? color : "none";
  const textColor = outlined ? color : "#fff";
  // The label + action button are drawn as ONE continuous box (rounded rect),
  // separated by a thin divider line, instead of two separate boxes with a gap.
  const boxRight = width - AXIS_GAP;
  const boxLeft = boxRight - labelW - actionW;
  const dividerX = boxRight - actionW;

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
        x2={boxLeft - 4}
        y1={y}
        y2={y}
        stroke={color}
        strokeWidth={line.isPosition && line.kind === "LIMIT" ? 1.6 : 1.2}
        strokeDasharray={dashed ? "5,4" : undefined}
        style={{ pointerEvents: "none" }}
      />
      {/* Merged box: label + (optional) action button */}
      <rect
        x={boxLeft}
        y={y - 9}
        width={boxRight - boxLeft}
        height={18}
        fill={pillFill}
        stroke={pillStroke}
        rx={2}
        style={{ pointerEvents: "none" }}
      />
      <text
        x={boxLeft + (dividerX - boxLeft) / 2}
        y={y + 4}
        fill={textColor}
        fontSize={10}
        fontFamily="var(--font-mono), monospace"
        textAnchor="middle"
        style={{ pointerEvents: "none" }}
      >
        {label}
      </text>
      {hasAction && (
        <>
          {/* Thin divider between the label and the action button */}
          <line
            x1={dividerX}
            x2={dividerX}
            y1={y - 9}
            y2={y + 9}
            stroke={pillStroke !== "none" ? pillStroke : "#00000055"}
            strokeWidth={1}
            style={{ pointerEvents: "none" }}
          />
          <text
            x={dividerX + actionW / 2}
            y={y + 4}
            fill={textColor}
            fontSize={12}
            fontWeight="bold"
            textAnchor="middle"
            style={{ pointerEvents: "none" }}
          >
            ×
          </text>
          <rect
            x={dividerX}
            y={y - 9}
            width={actionW}
            height={18}
            fill="transparent"
            style={{ pointerEvents: "all", cursor: "pointer" }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              action?.();
            }}
          />
        </>
      )}
    </g>
  );
}

function stopEvt(e: React.MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}

const chipWidth = (s: string) => Math.max(s.length * 6.4 + 12, 22);

interface PendingCtl {
  kind: "TP" | "SL";
  onConfirm: () => void;
  onDiscard: () => void;
}

/**
 * TradingView-style position toolbar rendered on the entry line: a right-aligned
 * row of chips — [Discard] [Confirm] [TP/SL] [size] [P&L %] [×] — where the
 * Discard/Confirm/tag chips only appear while a TP/SL drag is pending.
 */
function EntryToolbarRow({
  y, width, qty, pnlPct, onClose, pending,
}: {
  y: number;
  width: number;
  qty: number;
  pnlPct: number;
  onClose?: () => void;
  pending: PendingCtl | null;
}) {
  const H = 18;
  const GAP = 4;
  const yTop = y - 9;
  const chips: { w: number; el: (x: number) => React.ReactNode }[] = [];

  // P&L percent merged with the close (×) button into ONE continuous outlined
  // box (black fill, blue border), separated by a thin divider — not two
  // separate boxes with a gap.
  const pnlStr = `${pnlPct >= 0 ? "+" : "−"}${Math.abs(pnlPct).toFixed(2)}%`;
  const pnlColor = pnlPct >= 0 ? TP_COLOR : LIQ_COLOR;
  const pnlW = chipWidth(pnlStr);
  const closeW = 18;
  const mergedW = pnlW + closeW;
  chips.push({
    w: mergedW,
    el: (x) => (
      <g key="pnl-close">
        <rect x={x} y={yTop} width={mergedW} height={H} rx={3} fill="#0a0a0a" stroke={LIMIT_COLOR} />
        <text x={x + pnlW / 2} y={y + 4} fill={pnlColor} fontSize={10} fontFamily="var(--font-mono), monospace" textAnchor="middle">{pnlStr}</text>
        <line x1={x + pnlW} x2={x + pnlW} y1={yTop} y2={yTop + H} stroke={LIMIT_COLOR} strokeWidth={1} />
        <text x={x + pnlW + closeW / 2} y={y + 4} fill={LIMIT_COLOR} fontSize={12} fontWeight="bold" textAnchor="middle">×</text>
        <rect
          x={x + pnlW}
          y={yTop}
          width={closeW}
          height={H}
          fill="transparent"
          style={{ pointerEvents: "all", cursor: "pointer" }}
          onMouseDown={stopEvt}
          onClick={(e) => { stopEvt(e); onClose?.(); }}
        />
      </g>
    ),
  });

  // Position size.
  const sizeStr = String(qty);
  const sizeW = chipWidth(sizeStr);
  chips.push({
    w: sizeW,
    el: (x) => (
      <g key="size">
        <rect x={x} y={yTop} width={sizeW} height={H} rx={3} fill={LIMIT_COLOR} />
        <text x={x + sizeW / 2} y={y + 4} fill="#fff" fontSize={10} fontWeight="bold" fontFamily="var(--font-mono), monospace" textAnchor="middle">{sizeStr}</text>
      </g>
    ),
  });

  if (pending) {
    const tagColor = pending.kind === "TP" ? TP_COLOR : SL_COLOR;
    const tagW = chipWidth(pending.kind);
    chips.push({
      w: tagW,
      el: (x) => (
        <g key="tag">
          <rect x={x} y={yTop} width={tagW} height={H} rx={3} fill="none" stroke={tagColor} strokeDasharray="3,2" />
          <text x={x + tagW / 2} y={y + 4} fill={tagColor} fontSize={10} fontWeight="bold" textAnchor="middle">{pending.kind}</text>
        </g>
      ),
    });
    chips.push({
      w: 58,
      el: (x) => (
        <g key="confirm" style={{ pointerEvents: "all", cursor: "pointer" }} onMouseDown={stopEvt}
           onClick={(e) => { stopEvt(e); pending.onConfirm(); }}>
          <rect x={x} y={yTop} width={58} height={H} rx={3} fill={LIMIT_COLOR} />
          <text x={x + 29} y={y + 4} fill="#fff" fontSize={10} fontWeight="bold" textAnchor="middle">Confirm</text>
        </g>
      ),
    });
    chips.push({
      w: 58,
      el: (x) => (
        <g key="discard" style={{ pointerEvents: "all", cursor: "pointer" }} onMouseDown={stopEvt}
           onClick={(e) => { stopEvt(e); pending.onDiscard(); }}>
          <rect x={x} y={yTop} width={58} height={H} rx={3} fill="#2a2e39" stroke="#434651" />
          <text x={x + 29} y={y + 4} fill="#d1d4dc" fontSize={10} textAnchor="middle">Discard</text>
        </g>
      ),
    });
  }

  // Lay chips out right→left, kept clear of the price scale.
  let x = width - AXIS_GAP;
  const placed: React.ReactNode[] = [];
  for (const c of chips) {
    x -= c.w;
    placed.push(c.el(x));
    x -= GAP;
  }
  const lineEnd = Math.max(0, x);

  return (
    <g>
      <line x1={0} x2={lineEnd} y1={y} y2={y} stroke={LIMIT_COLOR} strokeWidth={1.6} style={{ pointerEvents: "none" }} />
      {placed}
    </g>
  );
}

interface AxisLevel {
  id: string;
  price: number;
  color: string;
}

/**
 * Levels for the open position (EP/TP/SL/liquidation) to mirror as native
 * price lines, so the price scale shows a color-matched axis label — and the
 * line itself spans the full pane width (uncut by our custom SVG boxes),
 * continuing past them all the way to that label. Pure so it can drive a
 * useEffect dependency without recomputing coordinates (no chart/series
 * needed here, unlike the SVG-rendering pass below).
 */
function computeAxisLevels(positions: Position[], orders: Order[], symbol: string): AxisLevel[] {
  const cleanedSym = cleanSym(symbol);
  const out: AxisLevel[] = [];
  for (const pos of positions) {
    if (pos.positionAmt === 0 || pos.symbol !== cleanedSym) continue;
    const closeSide: "BUY" | "SELL" = pos.positionAmt > 0 ? "SELL" : "BUY";
    out.push({ id: `${cleanedSym}-EP`, price: pos.entryPrice, color: LIMIT_COLOR });

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

    if (tpPrice && tpPrice > 0) out.push({ id: `${cleanedSym}-TP`, price: tpPrice, color: TP_COLOR });
    if (slPrice && slPrice > 0) out.push({ id: `${cleanedSym}-SL`, price: slPrice, color: SL_COLOR });
    if (pos.liquidationPrice > 0) out.push({ id: `${cleanedSym}-LIQ`, price: pos.liquidationPrice, color: LIQ_COLOR });
  }
  return out;
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

  // Native price lines for EP/TP/SL/liquidation: these are drawn on the chart's
  // own canvas (always in sync, no React-render lag) and span the FULL pane
  // width, so they visibly continue past our custom SVG box all the way to a
  // color-matched label on the price scale — instead of a plain last-price tag.
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  useEffect(() => {
    if (!candleSeries) return;
    const levels = computeAxisLevels(positions, orders, symbol);
    const map = priceLinesRef.current;
    const seen = new Set<string>();
    for (const lvl of levels) {
      seen.add(lvl.id);
      const existing = map.get(lvl.id);
      if (existing) {
        existing.applyOptions({ price: lvl.price, color: lvl.color });
      } else {
        map.set(
          lvl.id,
          candleSeries.createPriceLine({
            price: lvl.price,
            color: lvl.color,
            lineWidth: 1,
            lineStyle: 0, // Solid
            axisLabelVisible: true,
            lineVisible: true,
            title: "",
          }),
        );
      }
    }
    for (const [id, line] of map) {
      if (!seen.has(id)) {
        candleSeries.removePriceLine(line);
        map.delete(id);
      }
    }
  }, [candleSeries, positions, orders, symbol]);

  // Drop all price lines when the series itself goes away (symbol/chart teardown).
  useEffect(() => {
    return () => {
      if (!candleSeries) return;
      for (const line of priceLinesRef.current.values()) {
        try {
          candleSeries.removePriceLine(line);
        } catch {
          // series may already be disposed
        }
      }
      priceLinesRef.current.clear();
    };
  }, [candleSeries]);

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

  // Right-align labels to the plot area's edge (left of the price scale), not the
  // full container width (which includes the ~60px price scale). Using the plot
  // width makes AXIS_GAP an actual visible gap from the scale.
  const plotW = chart.timeScale().width() || width;

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
        onRemove: () => {
          if (pending?.id === id) setPending(null);
          void setPositionTpSl(symbol, pos, { sl: null });
        },
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
        {(() => {
          // Resolve the pending (TP/SL) line so its Discard/Confirm controls can
          // be shown on the entry-price toolbar.
          const pendingLine = pending ? lines.find((l) => l.id === pending.id) : undefined;
          const pendingCtl: PendingCtl | null =
            pending && pendingLine && (pendingLine.kind === "TP" || pendingLine.kind === "SL")
              ? {
                  kind: pendingLine.kind,
                  onConfirm: () => {
                    const pr = pending.price;
                    setPending(null);
                    void pendingLine.confirm?.(pr);
                  },
                  onDiscard: () => setPending(null),
                }
              : null;

          return lines.map((line, i) => {
            // While dragging (preview) or awaiting confirmation (pending), draw the
            // line at the dragged price instead of the stored one.
            const effPrice =
              line.id && preview?.id === line.id
                ? preview.price
                : line.id && pending?.id === line.id
                  ? pending.price
                  : line.price;
            const y = candleSeries.priceToCoordinate(effPrice);
            if (y === null) return null;
            const yPx = y as number;
            if (yPx < 0 || yPx > mainPaneHeight) return null;

            // The open-position entry line renders as the chip toolbar.
            if (line.kind === "LIMIT" && line.isPosition) {
              return (
                <EntryToolbarRow
                  key={line.id ?? `entry-${i}`}
                  y={yPx}
                  width={plotW}
                  qty={line.qty}
                  pnlPct={line.livePct ?? 0}
                  onClose={line.onClose}
                  pending={pendingCtl}
                />
              );
            }

            const renderLine = effPrice === line.price ? line : { ...line, price: effPrice };
            return (
              <LineRow
                key={line.id ?? `line-${i}-${line.kind}`}
                line={renderLine}
                y={yPx}
                width={plotW}
                modifying={line.modifying ?? false}
                onMouseDown={(e) => {
                  if (line.onDrag) startDrag(e, line.onDrag, line.onCommit);
                }}
              />
            );
          });
        })()}
      </g>
    </svg>
  );
}
