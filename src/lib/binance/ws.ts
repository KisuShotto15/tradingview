import type { Candle, Timeframe } from "./types";
import { isPerp, cleanSym } from "./rest";
import {
  FeedStatusEmitter,
  STALE_MS,
  WATCHDOG_MS,
} from "@/lib/feed-status";

const SPOT_WS = "wss://stream.binance.com:9443/stream";
const FUTURES_WS = "wss://fstream.binance.com/stream";

interface KlineMsg {
  stream: string;
  data: {
    e: string;
    E: number;
    s: string;
    k: {
      t: number;
      T: number;
      s: string;
      i: string;
      o: string;
      c: string;
      h: string;
      l: string;
      v: string;
      x: boolean;
    };
  };
}

interface MiniTickerMsg {
  stream: string;
  data: {
    e: string;
    E: number;
    s: string;
    c: string;
    o: string;
    h: string;
    l: string;
    v: string;
    q: string;
  };
}

interface BookTickerMsg {
  stream: string;
  data: {
    u: number;
    s: string;
    b: string;
    B: string;
    a: string;
    A: string;
  };
}

/**
 * A single executed trade. This is the fastest price Binance publishes: the
 * kline stream is sent on a fixed interval (250ms on futures, 1s on spot)
 * however busy the market is, so a chart driven by klines alone can never
 * move more often than that. TradingView's own last price comes from the
 * trade feed, which is why its number changes several times a second.
 */
interface AggTradeMsg {
  stream: string;
  data: {
    e: string;
    E: number;
    s: string;
    p: string;
    q: string;
    T: number;
    m: boolean;
  };
}

export interface Trade {
  /** Trade price. */
  price: number;
  /** Trade size, in the base asset. */
  qty: number;
  /** Trade time, in seconds. */
  time: number;
}

type WSMsg = KlineMsg | MiniTickerMsg | BookTickerMsg | AggTradeMsg;

export interface KlineSubscription {
  symbol: string;
  interval: Timeframe;
  onCandle: (c: Candle) => void;
}

/**
 * One Binance WS connection (either spot or futures). Multiplexed with
 * auto-reconnect.
 */
class BinanceWSConn {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;
  private klineSubs = new Map<string, KlineSubscription>();
  private tickerSubs = new Map<string, (m: MiniTickerMsg["data"]) => void>();
  private bookTickerSubs = new Map<string, (m: { bid: number; ask: number }) => void>();
  private tradeSubs = new Map<string, (t: Trade) => void>();
  private connected = false;
  private closing = false;
  /** When the last frame arrived. Drives the staleness watchdog below. */
  private lastMsgAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  readonly status = new FeedStatusEmitter();

  constructor(private url: string, private symbolDecorator: (s: string) => string) {}

  private subCount(): number {
    return (
      this.klineSubs.size +
      this.tickerSubs.size +
      this.bookTickerSubs.size +
      this.tradeSubs.size
    );
  }

  /**
   * Force a reconnect when the socket has gone silent.
   *
   * `onclose` is not guaranteed: a half-open socket (laptop sleep, a network
   * switch, a VPN dropping) keeps `readyState` at OPEN forever and the chart
   * freezes with nothing logged anywhere. Closing it here routes the failure
   * back into the normal `onclose` -> `scheduleReconnect` path.
   */
  private startWatchdog() {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      if (this.closing || !this.connected || this.subCount() === 0) return;
      if (Date.now() - this.lastMsgAt < STALE_MS.binance) return;
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
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.lastMsgAt = Date.now();
      this.status.set("live");
      this.startWatchdog();
      const streams: string[] = [];
      this.klineSubs.forEach((s) => {
        streams.push(`${cleanSym(s.symbol).toLowerCase()}@kline_${s.interval}`);
      });
      this.tickerSubs.forEach((_v, k) => streams.push(k));
      this.bookTickerSubs.forEach((_v, k) => streams.push(k));
      this.tradeSubs.forEach((_v, k) => streams.push(k));
      if (streams.length > 0) {
        this.send({ method: "SUBSCRIBE", params: streams, id: this.nextId++ });
      }
    };

    this.ws.onmessage = (ev) => {
      // Any frame counts as proof of life, the ack of a SUBSCRIBE included.
      this.lastMsgAt = Date.now();
      try {
        const msg = JSON.parse(ev.data) as WSMsg | { result: unknown; id: number };
        if ("stream" in msg) this.dispatch(msg);
      } catch {
        // ignore
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
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

  private dispatch(msg: WSMsg) {
    if (msg.stream.includes("@kline_")) {
      const sub = this.klineSubs.get(msg.stream);
      if (!sub) return;
      const k = (msg as KlineMsg).data.k;
      sub.onCandle({
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        isFinal: k.x,
      });
    } else if (msg.stream.includes("@miniTicker")) {
      const handler = this.tickerSubs.get(msg.stream);
      if (handler) handler((msg as MiniTickerMsg).data);
    } else if (msg.stream.includes("@aggTrade")) {
      const handler = this.tradeSubs.get(msg.stream);
      if (handler) {
        const d = (msg as AggTradeMsg).data;
        handler({
          price: parseFloat(d.p),
          qty: parseFloat(d.q),
          time: Math.floor(d.T / 1000),
        });
      }
    } else if (msg.stream.includes("@bookTicker")) {
      const handler = this.bookTickerSubs.get(msg.stream);
      if (handler) {
        const d = (msg as BookTickerMsg).data;
        handler({ bid: parseFloat(d.b), ask: parseFloat(d.a) });
      }
    }
  }

  subscribeKline(sub: KlineSubscription): () => void {
    const stream = `${cleanSym(sub.symbol).toLowerCase()}@kline_${sub.interval}`;
    this.klineSubs.set(stream, sub);
    if (this.connected) {
      this.send({ method: "SUBSCRIBE", params: [stream], id: this.nextId++ });
    } else if (!this.ws) {
      this.connect();
    }
    return () => {
      this.klineSubs.delete(stream);
      if (this.connected) {
        this.send({ method: "UNSUBSCRIBE", params: [stream], id: this.nextId++ });
      }
    };
  }

  subscribeMiniTickers(
    symbols: string[],
    onTick: (s: { symbol: string; close: number; open: number; pct: number }) => void,
  ): () => void {
    const streams = symbols.map(
      (s) => `${cleanSym(s).toLowerCase()}@miniTicker`,
    );
    streams.forEach((stream, i) => {
      const inputSym = symbols[i];
      this.tickerSubs.set(stream, (d) => {
        const close = parseFloat(d.c);
        const open = parseFloat(d.o);
        onTick({
          symbol: this.symbolDecorator(inputSym),
          close,
          open,
          pct: open === 0 ? 0 : ((close - open) / open) * 100,
        });
      });
    });
    if (this.connected) {
      this.send({ method: "SUBSCRIBE", params: streams, id: this.nextId++ });
    } else if (!this.ws) {
      this.connect();
    }
    return () => {
      streams.forEach((s) => this.tickerSubs.delete(s));
      if (this.connected) {
        this.send({ method: "UNSUBSCRIBE", params: streams, id: this.nextId++ });
      }
    };
  }

  /** Every executed trade on a symbol. See `AggTradeMsg` for why. */
  subscribeTrades(symbol: string, onTrade: (t: Trade) => void): () => void {
    const stream = `${cleanSym(symbol).toLowerCase()}@aggTrade`;
    this.tradeSubs.set(stream, onTrade);
    if (this.connected) {
      this.send({ method: "SUBSCRIBE", params: [stream], id: this.nextId++ });
    } else if (!this.ws) {
      this.connect();
    }
    return () => {
      this.tradeSubs.delete(stream);
      if (this.connected) {
        this.send({ method: "UNSUBSCRIBE", params: [stream], id: this.nextId++ });
      }
    };
  }

  subscribeBookTicker(
    symbol: string,
    onTick: (data: { bid: number; ask: number }) => void,
  ): () => void {
    const stream = `${cleanSym(symbol).toLowerCase()}@bookTicker`;
    this.bookTickerSubs.set(stream, onTick);
    if (this.connected) {
      this.send({ method: "SUBSCRIBE", params: [stream], id: this.nextId++ });
    } else if (!this.ws) {
      this.connect();
    }
    return () => {
      this.bookTickerSubs.delete(stream);
      if (this.connected) {
        this.send({ method: "UNSUBSCRIBE", params: [stream], id: this.nextId++ });
      }
    };
  }

  close() {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

/**
 * Public WS facade with two underlying connections (spot + futures). Routes
 * subscriptions by inspecting the symbol for the ".P" suffix.
 */
export class BinanceWS {
  private spot = new BinanceWSConn(SPOT_WS, (s) => s);
  private futures = new BinanceWSConn(FUTURES_WS, (s) => s);

  connect() {
    // Lazy: connect on first subscription
  }

  /**
   * Feed status for one symbol. Spot and futures are separate sockets, so
   * "is the feed alive?" is only answerable per symbol, not per exchange.
   */
  statusFor(symbol: string): FeedStatusEmitter {
    return isPerp(symbol) ? this.futures.status : this.spot.status;
  }

  subscribeKline(sub: KlineSubscription): () => void {
    const conn = isPerp(sub.symbol) ? this.futures : this.spot;
    return conn.subscribeKline(sub);
  }

  subscribeMiniTickers(
    symbols: string[],
    onTick: (s: { symbol: string; close: number; open: number; pct: number }) => void,
  ): () => void {
    const spotSyms = symbols.filter((s) => !isPerp(s));
    const perpSyms = symbols.filter((s) => isPerp(s));
    const unsubs: (() => void)[] = [];
    if (spotSyms.length > 0)
      unsubs.push(this.spot.subscribeMiniTickers(spotSyms, onTick));
    if (perpSyms.length > 0)
      unsubs.push(this.futures.subscribeMiniTickers(perpSyms, onTick));
    return () => unsubs.forEach((u) => u());
  }

  subscribeTrades(symbol: string, onTrade: (t: Trade) => void): () => void {
    const conn = isPerp(symbol) ? this.futures : this.spot;
    return conn.subscribeTrades(symbol, onTrade);
  }

  subscribeBookTicker(
    symbol: string,
    onTick: (data: { bid: number; ask: number }) => void,
  ): () => void {
    const conn = isPerp(symbol) ? this.futures : this.spot;
    return conn.subscribeBookTicker(symbol, onTick);
  }

  close() {
    this.spot.close();
    this.futures.close();
  }
}

let singleton: BinanceWS | null = null;
export function getBinanceWS(): BinanceWS {
  if (typeof window === "undefined") return new BinanceWS();
  if (!singleton) singleton = new BinanceWS();
  return singleton;
}
