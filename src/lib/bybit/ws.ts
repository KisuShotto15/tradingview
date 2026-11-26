import type { Candle, Timeframe } from "@/lib/binance/types";
import { bybitInterval, bybitSymbol } from "./public";
import {
  FeedStatusEmitter,
  STALE_MS,
  WATCHDOG_MS,
} from "@/lib/feed-status";

/**
 * Bybit public linear WS (kline stream) with the same `subscribeKline` shape as
 * the Binance WS, so PriceChart can pick a WS by source kind and stream Bybit
 * perps live. Auto-reconnects; sends a heartbeat ping every 20s as Bybit
 * requires, otherwise the socket is dropped.
 */

const WS_URL = "wss://stream.bybit.com/v5/public/linear";

export interface KlineSubscription {
  symbol: string;
  interval: Timeframe;
  onCandle: (c: Candle) => void;
}

interface BybitKlineMsg {
  topic: string;
  data: {
    start: number;
    end: number;
    open: string;
    close: string;
    high: string;
    low: string;
    volume: string;
    confirm: boolean;
  }[];
}

interface BybitTickerMsg {
  topic: string;
  type: "snapshot" | "delta";
  data: { symbol: string; lastPrice?: string; price24hPcnt?: string };
}

/**
 * A public trade. Bybit's kline topic is published on an interval, so a chart
 * driven by it alone cannot move faster than that however busy the market is.
 * The trade topic pushes per execution, which is where TradingView's
 * several-times-a-second last price comes from.
 */
interface BybitTradeMsg {
  topic: string;
  data: { T: number; s: string; p: string; v: string }[];
}

export interface Trade {
  price: number;
  qty: number;
  /** Trade time, in seconds. */
  time: number;
}

export interface MiniTick {
  symbol: string;
  close: number;
  open: number;
  pct: number;
}

class BybitWS {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private subs = new Map<string, KlineSubscription>(); // topic -> sub
  // topic -> listeners. Several independent components can watch the same
  // symbol at once (a watchlist row *and* BuySellOverlay's quote for the
  // currently-charted symbol, since Bybit has no separate book-ticker stream
  // to fall back to) — a single-entry map here silently drops whichever
  // subscriber isn't "last in", and unsubscribing one would delete the topic
  // out from under the other. Fan out to a Set of listeners per topic instead.
  private tickerSubs = new Map<string, Set<{ onTick: (t: MiniTick) => void; ticker: string }>>();
  private tradeSubs = new Map<string, (t: Trade) => void>();
  // `last` retains price/pct across delta frames (Bybit ticker deltas only
  // carry changed fields), shared by every listener on a topic.
  private tickerLast = new Map<string, { price: number; pct: number }>();
  private connected = false;
  private closing = false;
  /** When the last frame arrived. Drives the staleness watchdog below. */
  private lastMsgAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  readonly status = new FeedStatusEmitter();

  private topicOf(sub: KlineSubscription): string {
    return `kline.${bybitInterval(sub.interval)}.${bybitSymbol(sub.symbol)}`;
  }

  private subCount(): number {
    return this.subs.size + this.tickerSubs.size + this.tradeSubs.size;
  }

  /**
   * Force a reconnect when the socket has gone silent.
   *
   * The 20s heartbeat below only proves *we* are still sending. Bybit answers
   * each ping with a pong, so a live socket can never be silent for three
   * beats — but nothing was checking that the pongs still arrive. A half-open
   * socket (laptop sleep, a network switch, a VPN dropping) keeps
   * `readyState` at OPEN forever and the chart freezes with nothing logged
   * anywhere. Closing it here routes the failure back into the normal
   * `onclose` -> `scheduleReconnect` path.
   */
  private startWatchdog() {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      if (this.closing || !this.connected || this.subCount() === 0) return;
      if (Date.now() - this.lastMsgAt < STALE_MS.bybit) return;
      this.status.set("connecting");
      try {
        this.ws?.close();
      } catch {
        // Already gone; onclose has fired or will fire shortly.
      }
    }, WATCHDOG_MS);
  }

  private stopWatchdog() {
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  connect() {
    if (this.ws || this.closing) return;
    this.status.set("connecting");
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.lastMsgAt = Date.now();
      this.status.set("live");
      this.startWatchdog();
      const topics = [...this.subs.keys(), ...this.tickerSubs.keys(), ...this.tradeSubs.keys()];
      if (topics.length > 0) this.send({ op: "subscribe", args: topics });
      this.pingTimer = setInterval(() => this.send({ op: "ping" }), 20000);
    };

    this.ws.onmessage = (ev) => {
      // Any frame counts as proof of life, a pong or a subscribe ack included.
      this.lastMsgAt = Date.now();
      try {
        const msg = JSON.parse(ev.data) as BybitKlineMsg | BybitTickerMsg | BybitTradeMsg | { op?: string };
        if (!("topic" in msg) || !msg.topic) return;
        if (msg.topic.startsWith("kline.")) this.dispatch(msg as BybitKlineMsg);
        else if (msg.topic.startsWith("tickers.")) this.dispatchTicker(msg as BybitTickerMsg);
        else if (msg.topic.startsWith("publicTrade.")) this.dispatchTrade(msg as BybitTradeMsg);
      } catch {
        // ignore
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      this.stopWatchdog();
      this.status.set(this.closing ? "down" : "connecting");
      if (!this.closing) this.scheduleReconnect();
    };

    this.ws.onerror = () => this.ws?.close();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(payload: object) {
    if (this.ws && this.connected) this.ws.send(JSON.stringify(payload));
  }

  private dispatch(msg: BybitKlineMsg) {
    const sub = this.subs.get(msg.topic);
    if (!sub) return;
    for (const k of msg.data) {
      sub.onCandle({
        time: Math.floor(k.start / 1000),
        open: parseFloat(k.open),
        high: parseFloat(k.high),
        low: parseFloat(k.low),
        close: parseFloat(k.close),
        volume: parseFloat(k.volume),
        isFinal: k.confirm,
      });
    }
  }

  private dispatchTicker(msg: BybitTickerMsg) {
    const listeners = this.tickerSubs.get(msg.topic);
    if (!listeners) return;
    let last = this.tickerLast.get(msg.topic);
    if (!last) {
      last = { price: 0, pct: 0 };
      this.tickerLast.set(msg.topic, last);
    }
    if (msg.data.lastPrice !== undefined) last.price = parseFloat(msg.data.lastPrice);
    if (msg.data.price24hPcnt !== undefined) last.pct = parseFloat(msg.data.price24hPcnt) * 100;
    for (const { onTick, ticker } of listeners) {
      onTick({ symbol: ticker, close: last.price, open: 0, pct: last.pct });
    }
  }

  private dispatchTrade(msg: BybitTradeMsg) {
    const handler = this.tradeSubs.get(msg.topic);
    if (!handler || !Array.isArray(msg.data)) return;
    // Bybit batches executions into one frame; the last is the current price.
    for (const t of msg.data) {
      handler({ price: parseFloat(t.p), qty: parseFloat(t.v), time: Math.floor(t.T / 1000) });
    }
  }

  /** Every public execution on a symbol. See `BybitTradeMsg` for why. */
  subscribeTrades(symbol: string, onTrade: (t: Trade) => void): () => void {
    const topic = `publicTrade.${bybitSymbol(symbol)}`;
    this.tradeSubs.set(topic, onTrade);
    if (this.connected) this.send({ op: "subscribe", args: [topic] });
    else if (!this.ws) this.connect();
    return () => {
      this.tradeSubs.delete(topic);
      if (this.connected) this.send({ op: "unsubscribe", args: [topic] });
    };
  }

  subscribeKline(sub: KlineSubscription): () => void {
    const topic = this.topicOf(sub);
    this.subs.set(topic, sub);
    if (this.connected) this.send({ op: "subscribe", args: [topic] });
    else if (!this.ws) this.connect();
    return () => {
      this.subs.delete(topic);
      if (this.connected) this.send({ op: "unsubscribe", args: [topic] });
    };
  }

  /** Subscribe to live 24h ticker updates. Symbols may carry `BYBIT:`/`.P`; the
   *  emitted tick echoes the exact input symbol so callers can key rows by it.
   *  Multiple independent callers can watch the same underlying symbol; each
   *  gets its own listener entry rather than clobbering another caller's. */
  subscribeMiniTickers(symbols: string[], onTick: (t: MiniTick) => void): () => void {
    const topics = symbols.map((s) => `tickers.${bybitSymbol(s)}`);
    const listeners = topics.map((_, i) => ({ onTick, ticker: symbols[i] }));
    const newTopics: string[] = [];
    topics.forEach((topic, i) => {
      let set = this.tickerSubs.get(topic);
      if (!set) {
        set = new Set();
        this.tickerSubs.set(topic, set);
        newTopics.push(topic);
      }
      set.add(listeners[i]);
      // Deliver the cached price immediately so a subscriber that joins an
      // already-live topic doesn't sit stale until the next delta frame.
      const last = this.tickerLast.get(topic);
      if (last) onTick({ symbol: symbols[i], close: last.price, open: 0, pct: last.pct });
    });
    if (this.connected && newTopics.length > 0) this.send({ op: "subscribe", args: newTopics });
    else if (!this.ws) this.connect();
    return () => {
      topics.forEach((topic, i) => {
        const set = this.tickerSubs.get(topic);
        if (!set) return;
        set.delete(listeners[i]);
        if (set.size === 0) {
          this.tickerSubs.delete(topic);
          this.tickerLast.delete(topic);
          if (this.connected) this.send({ op: "unsubscribe", args: [topic] });
        }
      });
    };
  }

  close() {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.stopWatchdog();
    this.status.set("down");
    this.ws?.close();
    this.ws = null;
  }
}

let singleton: BybitWS | null = null;
export function getBybitWS(): BybitWS {
  if (typeof window === "undefined") return new BybitWS();
  if (!singleton) singleton = new BybitWS();
  return singleton;
}
