# Pendientes

Trabajo acordado pero aplazado. Cada entrada lleva lo necesario para retomarla
sin reconstruir la conversación en la que se decidió.

## Alertas en segundo plano con notificaciones push

**Estado:** aplazado a petición del usuario (2026-11-27). No empezar sin
confirmación.

**Problema.** Hoy las alertas se evalúan solo en el navegador
(`useAlertMonitor`, montado dentro de `PriceChart`). Solo saltan mientras está
abierto el gráfico de ese símbolo. Con la app cerrada, la pestaña en segundo
plano u otro símbolo en pantalla, no llega nada. No hay notificaciones push:
`public/sw.js` no maneja `push`.

**Plan propuesto:**

1. **Mover las alertas independientes a Supabase.** Las de precio, RSI y MACD
   viven hoy solo en `localStorage` (`alerts-store.ts`). Las ligadas a dibujos
   ya están en `user_drawings`.
2. **Un vigilante en el servidor**, en el Worker de Cloudflare del diario de
   trading (`kisushotto-site`), con un cron cada minuto:
   - leer las alertas activas;
   - pedir velas de 1m a Binance o Bybit;
   - comparar el **máximo y el mínimo** de la vela, no solo el último precio,
     para que un pico que cruza y vuelve dentro del minuto también dispare.

   No en Vercel: un cron allí consume invocaciones del plan.
3. **Web Push:**
   - suscripción con claves VAPID, guardada por dispositivo en Supabase;
   - manejador `push` en `public/sw.js` que llame a `showNotification`;
   - en iPhone solo funciona con la app instalada en la pantalla de inicio
     (iOS 16.4 o más reciente).
4. **Evitar el aviso doble.** Con la app abierta, el monitor del navegador y
   el servidor podrían avisar los dos; marcar `lastTriggeredAt` en la fila
   compartida.

**Limitación a explicar al usuario:** la granularidad es de un minuto, no de
cada tick.
