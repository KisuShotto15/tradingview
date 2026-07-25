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

**Tests** run on Node's built-in runner (`node --test`) with **no extra dependencies** — the sandbox has no npm registry access, so Vitest/Jest can't be installed. Node 24 strips TypeScript natively; `test/register.mjs` (loaded via `--import`) registers a resolve hook for the `@/*` alias + extensionless imports and polyfills `localStorage` for Zustand `persist` stores. Assertions use a tiny Jest-style shim at [src/test-utils/expect.ts](src/test-utils/expect.ts) over `node:assert`. Tests live next to the code as `*.test.ts` and cover **pure logic only** (stores, indicators, drawing/alert math, sizing, formatting, symbol resolution) — no DOM/component rendering. Add a test: create `foo.test.ts` importing from `node:test` + `@/test-utils/expect`.

`next build` runs the full TypeScript type-check (`paths` alias `@/*` → `src/*`). Note **Next 16 removed ESLint from the build** — lint runs only via `npm run lint`, never blocks `next build`.

Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (see `.env.example`). Without them, middleware auth and cloud sync fail. Binance market data needs no keys; private trading uses per-user keys entered in the UI.

**Note:** The `README.md` predates auth, drawings, and trading — treat this file and the code as the source of truth, not the README.

## Language

- All application UI strings are in **English**.
- Code comments and identifiers in English (consistent with UI).
- Commit messages and PR descriptions in **neutral Spanish** (no Argentine/Rioplatense slang: avoid "vos", "tenés", "querés", "andá", "che", etc.). Use "tú", "tienes", "quieres", "ve", "aquí".
- README and developer-facing docs can stay in Spanish (they're not part of the app UI).

## Architecture

Next.js 16 App Router, React 19, TypeScript, Tailwind 4 + shadcn/ui (Base UI primitives), Zustand for state, Supabase for auth + persistence, `lightweight-charts` v5 for rendering. **Everything client-side** except thin API routes.

### Data providers (multi-source)

The chart is no longer Binance-only. `resolveSource(symbol)` in `src/lib/symbols/source.ts` classifies a ticker, and `fetchCandles()` in `src/lib/data/fetch.ts` dispatches on `src.kind` to the right provider:

- **binance** — spot, or USDT-M perps (`.P` suffix, e.g. `BTCUSDT.P`) via `src/lib/binance/rest.ts` + live WebSocket (`ws.ts`).
- **synthetic** — arithmetic expressions over symbols (e.g. spreads/dominance) via `src/lib/binance/synthetic.ts`.
- **yahoo / fred / coingecko** — stocks, indices, macro series, market caps, proxied through `src/app/api/{yahoo,fred,coingecko}/route.ts` (server routes exist because these providers block CORS / need keys).

When adding a data source: extend `ResolvedSource`, the catalog (`src/lib/symbols/catalog.ts`), and the `switch` in both `resolveSource` and `fetchCandles`.

### Live data

A single multiplexed Binance WebSocket (`src/lib/binance/ws.ts`) carries both `@kline_<interval>` (active-candle updates) and `@miniTicker` (watchlist prices). Binance drops the socket ~every 24h; reconnect re-subscribes all active streams with exponential backoff. Non-Binance sources are REST-only (no live updates).

### Indicators

Pure TypeScript, computed client-side over the candle array on every update (`src/lib/indicators/`). `index.ts` has the primitives (`sma`, `ema` seeded with SMA, Wilder `rsi`, `macd`, `obv`); dedicated files hold the heavier custom studies (`adx.ts`, `squeeze.ts`, `vumanchu.ts`, `keylevels.ts`). Add a study: implement the calc, add its key to `IndicatorKey` + `IndicatorConfig`/`DEFAULT_CONFIG` in `chart-store.ts`, wire the toggle/settings dialog, and render its pane/overlay in `PriceChart.tsx`.

### State (Zustand stores, `src/lib/store/`)

- `chart-store.ts` — symbol, timeframe, indicators + config, colors/visual settings, watchlists, chart type. `persist`ed to localStorage.
- `drawings-store.ts` — all chart drawings (see below).
- `trading-store.ts` — API credentials, orders, positions, balance, order form.
- `mobile-store.ts` — mobile sheet/screen navigation.
- `alerts/toast-store.ts` — alert toasts.

### Undo/redo (unified history)

`src/lib/history/index.ts` defines a single `UnifiedHistoryStack` (`unifiedHistory`) recording three op kinds: `drawing`, `chartState` (indicator/config/visual changes), and `viewport`. Mutations that should be undoable go through it. Guard against re-recording during replay with `withoutHistory()` / `isApplyingHistory`. Note `src/lib/drawings/history.ts` also exists (drawing-specific); `src/lib/history/` is the newer unified layer.

### Drawing tools

All chart drawings (trendlines, fibs, rays, channels, long/short positions, horizontal/vertical lines, price/date ranges, rectangles, brush) live in `src/lib/drawings/` and `src/components/chart/drawings/`. They are:

- Rendered as an **SVG overlay** on top of lightweight-charts (`DrawingsLayer.tsx`), **not** via the Primitive API.
- Stored in `src/lib/store/drawings-store.ts`.
- Persisted to Supabase table `user_drawings` (one row per drawing, `data JSONB`, `kind` discriminator).
- Mutated only through actions that push to the undo/redo history.

The data model is a **discriminated union** by `kind`. All operations (render, hit-test, drag, serialize) `switch (drawing.kind)`. Coordinate ↔ price/time conversion helpers live in `src/lib/chart/coords.ts` and `snap.ts`; shared drag logic in `use-drag-point.ts` / `use-drag-shape.ts`.

### Trading (live Binance orders)

The user enters API key/secret in the UI (`trading-store.ts`). Order placement, cancels, leverage, positions, and balance go through `src/app/api/trade/*` routes, which HMAC-SHA256-sign requests server-side and forward to Binance spot or futures (prod or testnet, chosen by `isPerp` + `testnet`). Credentials are passed per-request in the body — they are **not** stored server-side. Chart order/position overlays live in `src/components/trading/`.

### Auth & cloud sync

`src/middleware.ts` (Supabase SSR) gates the whole app: unauthenticated users are redirected to `/login` (except `/login` and `/auth/*`). On sign-in, `useCloudSync` + `useDrawingsSync` (mounted in `src/components/providers.tsx`) load the user's chart settings, watchlist, and drawings from Supabase, then debounce-save changes back. Supabase clients: `client.ts` (browser), `server.ts` (route handlers / middleware). Schema + RLS policies in `supabase/schema.sql` and `supabase/migrations/`.

### Responsive shell

`src/app/page.tsx` branches on `useIsMobile()`: desktop renders the full sidebar/panel layout; mobile renders `MobileShell` (bottom-tab screens in `src/components/mobile/`). The dialog components are shared across both.

## Keyboard shortcuts

Centralized in `src/hooks/useKeyboardShortcuts.ts`. The chart-level handler is global (`window`), guarded against input elements.

| Key | Action |
|---|---|
| `Esc` | Cancel current placement → reset tool → deselect |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Del` / `Backspace` | Delete selected drawing |
