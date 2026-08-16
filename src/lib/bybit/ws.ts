import type { Candle, Timeframe } from "@/lib/binance/types";
import { bybitInterval, bybitSymbol } from "./public";

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

class BybitWS {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private subs = new Map<string, KlineSubscription>(); // topic -> sub
  private connected = false;
  private closing = false;

  private topicOf(sub: KlineSubscription): string {
    return `kline.${bybitInterval(sub.interval)}.${bybitSymbol(sub.symbol)}`;
  }

  connect() {
    if (this.ws || this.closing) return;
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      const topics = [...this.subs.keys()];
      if (topics.length > 0) this.send({ op: "subscribe", args: topics });
      this.pingTimer = setInterval(() => this.send({ op: "ping" }), 20000);
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as BybitKlineMsg | { op?: string };
        if ("topic" in msg && msg.topic?.startsWith("kline.")) this.dispatch(msg);
      } catch {
        // ignore
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
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

  close() {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
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
