# Kisu Charts 📈

> Plataforma de charts y trading de cripto en tiempo real.
> [charts.kisushotto.com](https://charts.kisushotto.com)

Datos de mercado públicos de **Binance** y **Bybit** (REST + WebSocket), más acciones,
índices y series macro vía Yahoo Finance, FRED y CoinGecko. Render con
[`lightweight-charts`](https://github.com/tradingview/lightweight-charts) v5.

---

## ✨ Qué incluye

- 📊 **Velas en vivo** por WebSocket de Binance y Bybit, con reconexión y backoff exponencial
- 🔍 **Búsqueda de símbolos** sobre todo el universo spot y perpetuos USDT de ambos exchanges
- 🌐 **Multi-fuente**: acciones, índices, futuros, macro (FRED) y dominancia (CoinGecko)
- 🧮 **Expresiones sintéticas**: spreads y ratios entre símbolos (`BTCUSDT/ETHUSDT`)
- ⏱️ **Multi-timeframe**: de 1m a 1M
- 📐 **Indicadores client-side**: EMA, RSI, MACD, OBV, ADX, Squeeze Momentum, VuManChu, key levels
- ✏️ **Herramientas de dibujo** persistidas por usuario: tendencias, Fibonacci, canales,
  pitchfork, XABCD, posiciones long/short, texto y anotaciones
- 💹 **Trading real** contra Binance y Bybit: órdenes, TP/SL arrastrables sobre el chart,
  apalancamiento, modo hedge
- 👁️ **Watchlists** con banderas de color, secciones y precios en vivo
- 🔔 **Alertas** por nivel y por dibujo
- ⏪ **Replay** barra por barra
- 📸 **Snapshots** del chart con las anotaciones compuestas, subidos a Supabase Storage
- 📱 **Shell móvil** dedicado

## 🚀 Empezar

```bash
npm install
cp .env.example .env.local   # completa las credenciales de Supabase
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

Los datos de mercado no necesitan claves. El trading privado usa las claves de API que
cada usuario introduce en la interfaz: se envían por petición y **no** se guardan en el
servidor. Supabase sí es obligatorio — sin él fallan la autenticación y la sincronización.

## 🛠️ Stack

| Capa | Tech |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS 4 + shadcn/ui (primitivos Base UI) |
| Charts | [lightweight-charts](https://github.com/tradingview/lightweight-charts) v5 |
| Estado | Zustand (con persistencia) |
| Backend | Supabase (auth, Postgres con RLS, Storage) |
| Datos | Binance, Bybit, Yahoo Finance, FRED, CoinGecko |

La arquitectura, las convenciones y las trampas conocidas están documentadas en
[CLAUDE.md](CLAUDE.md), que es la referencia viva del proyecto.

## 🌐 Deploy

Conecta el repositorio en [vercel.com/new](https://vercel.com/new). Hacen falta
`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` como variables de entorno,
y el dominio de producción debe estar en la lista de *Redirect URLs* de Supabase
(Authentication → URL Configuration) o los enlaces mágicos de acceso no vuelven.

## ⚖️ Atribución

`lightweight-charts` es Apache 2.0 y exige mantener la atribución a TradingView, Inc.
La librería la dibuja por su cuenta en una esquina del chart (opción `attributionLogo`,
activada por defecto). **No la quites**: es un requisito de la licencia.

Este proyecto no está afiliado a TradingView, Inc. ni a ningún exchange.
