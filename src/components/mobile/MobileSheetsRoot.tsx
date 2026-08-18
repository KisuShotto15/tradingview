"use client";

import { useEffect } from "react";
import { useMobileStore } from "@/lib/store/mobile-store";
import { useChartStore } from "@/lib/store/chart-store";
import { useTradingStore } from "@/lib/store/trading-store";
import { MobileDrawingsSheet } from "./MobileDrawingsSheet";
import { MobileIndicatorsSheet } from "./MobileIndicatorsSheet";
import { MobileAlertsSheet } from "./MobileAlertsSheet";
import { MobileTimeframeSheet } from "./MobileTimeframeSheet";
import { ApiKeyDialog } from "@/components/trading/ApiKeyDialog";
import { SymbolSelector } from "@/components/chart/SymbolSelector";

/**
 * Bridges the mobile sheet state (useMobileStore.sheet) to the various
 * dialogs / sheets across the app:
 *
 *  - "drawings"        → MobileDrawingsSheet (custom fullscreen list)
 *  - "indicators"      → MobileIndicatorsSheet (custom fullscreen list)
 *  - "alerts"          → MobileAlertsSheet (custom fullscreen list)
 *  - "timeframe"       → MobileTimeframeSheet (custom fullscreen list)
 *  - "symbolSearch"    → opens the existing SymbolSelector dialog (chart store)
 *  - "chartSettings"   → opens the existing Chart settings dialog (chart store)
 *  - "apiKey"          → opens the API-key dialog (trading store)
 *
 * The store-driven dialogs (symbolSearch, chartSettings, apiKey) are mounted
 * elsewhere and just need the right boolean flipped; this component does that
 * via a side-effect and then clears the mobile sheet slot so closing the
 * dialog from inside still works through its own onClose.
 */
export function MobileSheetsRoot() {
  const sheet = useMobileStore((s) => s.sheet);
  const closeSheet = useMobileStore((s) => s.closeSheet);
  const apiKeyDialogOpen = useTradingStore((s) => s.apiKeyDialogOpen);
  const setApiKeyDialogOpen = useTradingStore((s) => s.setApiKeyDialogOpen);

  // Bridge mobile-sheet slots that map to store-controlled dialogs.
  useEffect(() => {
    if (sheet === "symbolSearch") {
      useChartStore.getState().setSymbolDialogOpen(true);
      closeSheet();
    } else if (sheet === "chartSettings") {
      useChartStore.getState().setChartSettingsOpen(true);
      closeSheet();
    } else if (sheet === "apiKey") {
      setApiKeyDialogOpen(true);
      closeSheet();
    }
  }, [sheet, closeSheet, setApiKeyDialogOpen]);

  return (
    <>
      {sheet === "drawings" && <MobileDrawingsSheet />}
      {sheet === "indicators" && <MobileIndicatorsSheet />}
      {sheet === "alerts" && <MobileAlertsSheet />}
      {sheet === "timeframe" && <MobileTimeframeSheet />}
      {/* Headless SymbolSelector — renders only its dialog, no trigger. */}
      <SymbolSelector noTrigger />
      {/* Render ApiKeyDialog at root so it's reachable from mobile menu. */}
      {apiKeyDialogOpen && (
        <ApiKeyDialog onClose={() => setApiKeyDialogOpen(false)} />
      )}
    </>
  );
}
