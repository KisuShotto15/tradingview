"use client";

import { useState } from "react";

const QUOTE_ASSETS = ["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "USD", "BTC", "ETH", "BNB"];

export function getBaseAsset(symbol: string): string {
  const s = symbol.replace(/\.P$/, ""); // strip .P perpetual suffix
  for (const q of QUOTE_ASSETS) {
    if (s.endsWith(q)) return s.slice(0, -q.length);
  }
  return s;
}

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 60%, 42%)`;
}

interface Props {
  symbol: string;
  size?: number;
}

export function CoinIcon({ symbol, size = 18 }: Props) {
  const base = getBaseAsset(symbol);
  const slug = base.toLowerCase();
  const [errored, setErrored] = useState(false);
  const iconUrl = `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${slug}.svg`;

  if (!errored) {
    return (
      <img
        src={iconUrl}
        alt={base}
        width={size}
        height={size}
        className="shrink-0 rounded-full"
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.44,
        fontWeight: 700,
        backgroundColor: hashColor(base),
      }}
    >
      {base.slice(0, 1)}
    </div>
  );
}
