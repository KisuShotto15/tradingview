import type { Candle, Timeframe } from "./types";
import { isPerp, cleanSym } from "./rest";

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

type WSMsg = KlineMsg | MiniTickerMsg;

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
  private connected = false;
  private closing = false;

  constructor(private url: string, private symbolDecorator: (s: string) => string) {}

  connect() {
    if (this.ws || this.closing) return;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      const streams: string[] = [];
      this.klineSubs.forEach((s) => {
        streams.push(`${cleanSym(s.symbol).toLowerCase()}@kline_${s.interval}`);
      });
      this.tickerSubs.forEach((_v, k) => streams.push(k));
      if (streams.length > 0) {
        this.send({ method: "SUBSCRIBE", params: streams, id: this.nextId++ });
      }
    };

    this.ws.onmessage = (ev) => {
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
