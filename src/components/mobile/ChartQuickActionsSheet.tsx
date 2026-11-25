"use client";

import { AlarmClockPlus, ChevronsDown, ChevronsUp, Minus, MoveRight, PlusSquare } from "lucide-react";
import { generateId } from "@/lib/drawings/types";
import { useChartStore } from "@/lib/store/chart-store";
import { useMobileStore } from "@/lib/store/mobile-store";
import { useTradingStore } from "@/lib/store/trading-store";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { resolveSource } from "@/lib/symbols/source";
import { formatPrice } from "@/lib/format";

/**
 * The sheet behind the "+" on the price axis.
 *
 * On a phone there is no right-click, so everything the desktop chart offers
 * from a right-click at a price — add an alert there, draw a line there, put
 * an order there — had no way in at all. This is the venue's answer to that:
 * a "+" parked on the price scale, and one list of the things you can do *at
 * that price*. Every row names the price, because the point of the gesture is
 * that you picked it.
 */
export function ChartQuickActionsSheet({
  price,
  /** Bar time under the crosshair — where a ray should start. */
  time,
  onClose,
}: {
  price: number;
  time: number | null;
  onClose: () => void;
}) {
  const symbol = useChartStore((s) => s.symbol);
  const openAlertDialog = useChartStore((s) => s.openAlertDialog);
  const toolDefaults = useChartStore((s) => s.toolDefaults);
  const setTab = useMobileStore((s) => s.setTab);
  const { add } = useDrawings();

  const exchange = useTradingStore((s) => s.exchange);
  const hasKeys = useTradingStore((s) => !!s.apiKey && !!s.apiSecret);
  const updateForm = useTradingStore((s) => s.updateForm);
  // The account belongs to one venue; the chart may be showing another's
  // ticker, and an order placed from here would silently go to the wrong one.
  const canTrade = hasKeys && resolveSource(symbol).kind === exchange;

  const shown = formatPrice(price);

  function addAlert() {
    openAlertDialog(price);
    onClose();
  }

  function drawHLine() {
    void add({
      id: generateId(),
      kind: "hline",
      symbol,
      price,
      ...(toolDefaults["hline"] ?? {}),
    });
    onClose();
  }

  function drawHRay() {
    if (time === null) return;
    void add({
      id: generateId(),
      kind: "hray",
      symbol,
      anchor: { time, price },
      ...(toolDefaults["hray"] ?? {}),
    });
    onClose();
  }

  function prepareOrder(side: "BUY" | "SELL") {
    // Fills the order form and hands over to the Trade tab rather than firing
    // straight at the exchange: a tap on a list is not a confirmation, and the
    // panel is where size, leverage and brackets are chosen.
    updateForm({ side, type: "LIMIT", price: String(price) });
    setTab("trade");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Actions at price">
      {/* Tapping away is how a bottom sheet is dismissed on a phone. */}
      <button
        className="absolute inset-0 bg-black/50"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative max-h-[70%] overflow-y-auto rounded-t-2xl border-t border-tv-border bg-tv-panel pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex justify-center py-2">
          <span className="h-1 w-10 rounded-full bg-tv-border" />
        </div>

        <Row icon={<AlarmClockPlus className="h-5 w-5" />} onClick={addAlert}>
          Add alert on {symbol} at <Value>{shown}</Value>
        </Row>

        {canTrade && (
          <>
            <Divider />
            <Row icon={<ChevronsUp className="h-5 w-5" />} onClick={() => prepareOrder("BUY")}>
              Buy {symbol} at <Value>{shown}</Value> limit
            </Row>
            <Row icon={<ChevronsDown className="h-5 w-5" />} onClick={() => prepareOrder("SELL")}>
              Sell {symbol} at <Value>{shown}</Value> limit
            </Row>
            <Row icon={<PlusSquare className="h-5 w-5" />} onClick={() => prepareOrder("BUY")}>
              Add order on {symbol} at <Value>{shown}</Value>…
            </Row>
          </>
        )}

        <Divider />
        <Row icon={<Minus className="h-5 w-5" />} onClick={drawHLine}>
          Draw horizontal line at <Value>{shown}</Value>
        </Row>
        {time !== null && (
          <Row icon={<MoveRight className="h-5 w-5" />} onClick={drawHRay}>
            Draw horizontal ray at <Value>{shown}</Value>
          </Row>
        )}
      </div>
    </div>
  );
}

function Row({
  icon, children, onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 px-4 py-3.5 text-left text-sm text-tv-text active:bg-tv-panel-hover"
    >
      <span className="shrink-0 text-tv-text-muted">{icon}</span>
      <span className="min-w-0">{children}</span>
    </button>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold tabular-nums">{children}</span>;
}

function Divider() {
  return <div className="my-1 h-px bg-tv-border/70" />;
}
