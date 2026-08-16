# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Next.js dev server (http://localhost:3000)
npm run build    # Production build (also runs the full TypeScript type-check)
npm run start    # Serve the production build
npm run lint     # ESLint (eslint.config.mjs, flat config)
npm test         # Unit tests (see below)
npm run test:watch
```

**Tests** run on Node's built-in runner (`node --test`) with **no extra dependencies** — the sandbox has no npm registry access, so Vitest/Jest can't be installed. Node 24 strips TypeScript natively; `test/register.mjs` (loaded via `--import`) registers a resolve hook for the `@/*` alias + extensionless imports and polyfills `localStorage` for Zustand `persist` stores. Assertions use a tiny Jest-style shim at [src/test-utils/expect.ts](src/test-utils/expect.ts) over `node:assert`. Tests live next to the code as `*.test.ts` and cover **pure logic only** (stores, indicators, drawing/alert math, sizing, formatting, symbol/exchange resolution) — no DOM/component rendering. Add a test: create `foo.test.ts` importing from `node:test` + `@/test-utils/expect`.

The `npm test` script bakes in the `src/**/*.test.ts` glob, so to scope a run, invoke node directly:

```bash
# One file
node --import ./test/register.mjs --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  --test --test-isolation=none src/lib/trading/sizing.test.ts

# One test/suite by name, across the suite
node --import ./test/register.mjs --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  --test --test-isolation=none --test-name-pattern="slInputToPrice" "src/**/*.test.ts"
```

`--test-isolation=none` is required (Zustand `persist` needs the shared polyfilled `localStorage`).

`next build` runs the full TypeScript type-check (`paths` alias `@/*` → `src/*`). Note **Next 16 removed ESLint from the build** — lint runs only via `npm run lint`, never blocks `next build`. The repo carries pre-existing `react-hooks` lint errors unrelated to most changes; don't treat a red `npm run lint` as a regression without checking whether your files are involved.

Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (see `.env.example`). Without them, middleware auth and cloud sync fail. Market data needs no keys; private trading uses per-user keys entered in the UI.

**Note:** The `README.md` predates auth, drawings, and trading — treat this file and the code as the source of truth, not the README.

## Language

- All application UI strings are in **English**.
- Code comments and identifiers in English (consistent with UI).
- Commit messages and PR descriptions in **neutral Spanish** (no Argentine/Rioplatense slang: avoid "vos", "tenés", "querés", "andá", "che", etc.). Use "tú", "tienes", "quieres", "ve", "aquí".
- README and developer-facing docs can stay in Spanish (they're not part of the app UI).

## Architecture

Next.js 16 App Router, React 19, TypeScript, Tailwind 4 + shadcn/ui (Base UI primitives), Zustand for state, Supabase for auth + persistence, `lightweight-charts` v5 for rendering. **Everything client-side** except thin API routes.

### Symbol identity (read this before touching anything symbol-related)

A ticker string carries up to three pieces of meaning, and several bugs have come from conflating them:

- `BTCUSDT` — bare exchange symbol.
- `.P` suffix (`BTCUSDT.P`) — USDT-M **perpetual** rather than spot. `isPerp()`.
- `BYBIT:` prefix (`BYBIT:SOLUSDT.P`) — TradingView-style **exchange qualifier**, so a ticker listed on both venues can be charted from either. [src/lib/symbols/prefix.ts](src/lib/symbols/prefix.ts) is a dependency-free leaf module (imported by both low-level Binance helpers and the resolver, so it must not import them back).

`cleanSym()` in [src/lib/binance/rest.ts](src/lib/binance/rest.ts) strips **both** decorations to get the raw exchange symbol — that's what every exchange API call and every position/order match must use. `resolveSource()` decides which *data provider* serves the chart.

Consequence worth remembering: two different chart symbols (`SOLUSDT.P` and `BYBIT:SOLUSDT.P`) reduce to the same `cleanSym`, so matching an account position by symbol alone is not enough — see "Exchange gating" below.

### Data providers (multi-source)

`resolveSource(symbol)` in [src/lib/symbols/source.ts](src/lib/symbols/source.ts) classifies a ticker, and `fetchCandles()` in [src/lib/data/fetch.ts](src/lib/data/fetch.ts) dispatches on `src.kind`:

- **binance** — spot, or USDT-M perps, via `src/lib/binance/rest.ts` + live WebSocket (`ws.ts`).
- **bybit** — linear USDT perps via `src/lib/bybit/public.ts` (REST klines/tickers/instruments) + `src/lib/bybit/ws.ts` (live klines + tickers). Public data only; no credentials.
- **synthetic** — arithmetic expressions over symbols (spreads/dominance) via `src/lib/binance/synthetic.ts`.
- **yahoo / fred / coingecko** — stocks, indices, macro, market caps, proxied through `src/app/api/{yahoo,fred,coingecko}/route.ts` (these providers block CORS / need keys).

The symbol **catalog** ([src/lib/symbols/catalog.ts](src/lib/symbols/catalog.ts)) has a static half (curated stocks/indices/macro) and a **dynamic registry** populated at runtime: `useBybitSymbols` fetches Bybit's whole perp universe on app load and calls `registerDynamicEntries()` so those tickers resolve and appear in search. `resolveSource` also honours an explicit `BYBIT:` prefix *before* consulting the catalog, so a persisted Bybit symbol charts correctly right after a reload, before the registry has loaded.

When adding a data source: extend `ResolvedSource`, `SourceKind`, and the `switch` in both `resolveSource` and `fetchCandles`.

### Live data

Binance uses one multiplexed WebSocket (`src/lib/binance/ws.ts`) carrying `@kline_<interval>`, `@miniTicker` and `@bookTicker`. Bybit has its own (`src/lib/bybit/ws.ts`) exposing a deliberately **matching `subscribeKline` / `subscribeMiniTickers` shape**, so consumers pick a socket by source kind and otherwise treat them alike. Bybit requires a 20s heartbeat ping and sends ticker *deltas* (only changed fields), so its client retains last price/percent between frames. Both reconnect with exponential backoff. Non-crypto sources are REST-poll only.

### Indicators

Pure TypeScript, computed client-side over the candle array on every update (`src/lib/indicators/`). `index.ts` has the primitives (`sma`, `ema` seeded with SMA, Wilder `rsi`, `macd`, `obv`); dedicated files hold the heavier custom studies (`adx.ts`, `squeeze.ts`, `vumanchu.ts`, `keylevels.ts`). Add a study: implement the calc, add its key to `IndicatorKey` + `IndicatorConfig`/`DEFAULT_CONFIG` in `chart-store.ts`, wire the toggle/settings dialog, and render its pane/overlay in `PriceChart.tsx`.

### State (Zustand stores, `src/lib/store/`)

- `chart-store.ts` — symbol, timeframe, indicators + config, colors/visual settings, watchlists, chart type, right-sidebar tab/width. `persist`ed to localStorage.
- `drawings-store.ts` — all chart drawings (see below).
- `trading-store.ts` — exchange choice, API credentials, orders, positions, balance, order form.
- `mobile-store.ts` — mobile sheet/screen navigation.
- `alerts/toast-store.ts` — alert toasts.
- `replay/replay-store.ts` — bar-replay cursor/playback (session-only, not persisted).

Note `trading-store` keeps **two** position lists: `positions` (scoped to the chart's current symbol, drives the chart overlay and order panel) and `allPositions` (every open position on the account, so the watchlist can badge any row). Both are refreshed by `useTradingSync`.

Cross-cutting hooks are mounted once in [src/components/providers.tsx](src/components/providers.tsx): `useCloudSync`, `useDrawingsSync`, `useKeyboardShortcuts`, `useTradingSync` (5s account poll), `useBybitSymbols`.

### Undo/redo (unified history)

`src/lib/history/index.ts` defines a single `UnifiedHistoryStack` (`unifiedHistory`) recording three op kinds: `drawing`, `chartState` (indicator/config/visual changes), and `viewport`. Mutations that should be undoable go through it. Guard against re-recording during replay with `withoutHistory()` / `isApplyingHistory`. Note `src/lib/drawings/history.ts` also exists (drawing-specific); `src/lib/history/` is the newer unified layer.

### Drawing tools

All chart drawings (trendlines, fibs, rays, channels, long/short positions, horizontal/vertical lines, price/date ranges, rectangles, brush) live in `src/lib/drawings/` and `src/components/chart/drawings/`. They are:

- Rendered as an **SVG overlay** on top of lightweight-charts (`DrawingsLayer.tsx`), **not** via the Primitive API.
- Stored in `src/lib/store/drawings-store.ts`.
- Persisted to Supabase table `user_drawings` (one row per drawing, `data JSONB`, `kind` discriminator).
- Mutated only through actions that push to the undo/redo history.

The data model is a **discriminated union** by `kind`. All operations (render, hit-test, drag, serialize) `switch (drawing.kind)`. Coordinate ↔ price/time conversion helpers live in `src/lib/chart/coords.ts` and `snap.ts`; shared drag logic in `use-drag-point.ts` / `use-drag-shape.ts`.

### Trading (live Binance + Bybit orders)

The user picks an exchange and enters API key/secret in the UI (`trading-store.ts`, persisted). Everything private goes through `src/app/api/trade/*`, which signs server-side and forwards to the venue. Credentials are passed per-request in the body/query — they are **not** stored server-side.

Each route takes an `exchange` param and dispatches: Binance is signed inline (HMAC-SHA256 over the query string), while Bybit lives in [src/lib/exchanges/bybit.ts](src/lib/exchanges/bybit.ts) (V5 scheme: `HMAC(timestamp + apiKey + recvWindow + payload)` with `X-BAPI-*` headers). That module also holds **pure mappers** normalizing Bybit responses to the shared `Order` / `Position` / `AssetBalance` shapes, which is where its tests live. Adding an exchange means extending `Exchange`, the per-route dispatch, and a mapper module.

Two venue differences leak into the shared model and are easy to get wrong:

- **TP/SL attachment.** Binance expresses them as separate `reduceOnly` orders; Bybit stores them *on the position* (`takeProfit`/`stopLoss`, set via the Bybit-only `/api/trade/trading-stop` route). `Position` carries optional fields for both, and UI prefers the position's own values, falling back to matching orders. A position's stop can therefore surface twice (as a position field *and* an order) — the chart overlay deliberately skips orders a position already draws.
- **Hedge mode.** Bybit rejects orders whose `positionIdx` doesn't match the account's position mode (0 one-way, 1 hedge-long, 2 hedge-short). `Position.positionIdx` is plumbed through so TP/SL edits, closes, and new orders send the right index.

`Position.percentage` is the true **ROI** (`unrealizedPnl / initialMargin`), not a naive price-delta × leverage estimate — those diverge, and even flip sign, once margin is added or the account is on cross. The chart's entry line intentionally shows *price movement* instead, matching TradingView; the positions table shows the ROI.

**Exchange gating:** account data always comes from the single connected exchange, but the chart may be showing a different venue's symbol. UI that overlays account state (chart order lines, watchlist position badges) must check `resolveSource(symbol).kind === tradingExchange` before rendering, or a Bybit position leaks onto a Binance chart of the same ticker.

Order sizing/risk math is pure and tested in [src/lib/trading/sizing.ts](src/lib/trading/sizing.ts). Canonical state is `qty` (base asset); every other display value is derived. Two distinct concepts share the word "risk" and must not be conflated: `SizingMode.RISK_USD`/`RISK_PCT` size the position *from* a risk budget and the stop distance, whereas `SlMode` only expresses *where* the stop sits (`PRICE` / `PCT_PRICE`). Risk is deliberately not an `SlMode`, since risk-on-both-sides is circular.

Chart-side trading UI is in `src/components/trading/`. `OrderLinesLayer.tsx` draws entry/TP/SL/liquidation as an SVG overlay **plus** native lightweight-charts price lines — the native ones give the colored price-scale label and span the full pane (so a line continues past the SVG chip toolbar), and they're kept in sync with any in-progress drag so a dragged level doesn't leave a duplicate behind. Position TP/SL edits are two-step: drag → `pending` → explicit Confirm/Discard on the entry line before anything is sent.

### Auth & cloud sync

`src/middleware.ts` (Supabase SSR) gates the whole app: unauthenticated users are redirected to `/login` (except `/login` and `/auth/*`). On sign-in, `useCloudSync` + `useDrawingsSync` load the user's chart settings, watchlist, and drawings from Supabase, then debounce-save changes back. Supabase clients: `client.ts` (browser), `server.ts` (route handlers / middleware). Schema + RLS policies in `supabase/schema.sql` and `supabase/migrations/`.

### Responsive shell

`src/app/page.tsx` branches on `useIsMobile()`: desktop renders the full sidebar/panel layout; mobile renders `MobileShell` (bottom-tab screens in `src/components/mobile/`). The dialog components are shared across both.

### Typography

The app leans heavily on very small arbitrary text sizes (`text-[9px]`…`text-[12px]`). [src/app/globals.css](src/app/globals.css) overrides these **globally**, enforcing an 11px floor, and also raises Tailwind's `--text-xs`/`--text-sm` tokens. The overrides are declared *unlayered* (outside `@layer`) so they beat Tailwind's generated utilities regardless of source order. So a `text-[10px]` in a component does not render at 10px — change the sizing scale there, not per-component, and verify against the compiled CSS.

SVG overlays (chart drawings, order lines) size text with the numeric `fontSize` attribute instead, which those CSS rules do **not** affect — they must be adjusted in the components themselves.

## Keyboard shortcuts

Centralized in `src/hooks/useKeyboardShortcuts.ts`. The chart-level handler is global (`window`), guarded against input elements.

| Key | Action |
|---|---|
| `Esc` | Cancel current placement → reset tool → deselect |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Del` / `Backspace` | Delete selected drawing |
