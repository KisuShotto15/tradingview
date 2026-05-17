"use client";

import { useChartStore } from "@/lib/store/chart-store";
import {
  addPriceLineCloud,
  removePriceLineCloud,
  clearPriceLinesCloud,
} from "./user-data";
import { useAuth } from "./auth-context";

export function usePriceLines() {
  const { user } = useAuth();
  const addPriceLine = useChartStore((s) => s.addPriceLine);
  const addPriceLineById = useChartStore((s) => s.addPriceLineById);
  const removePriceLine = useChartStore((s) => s.removePriceLine);
  const clearPriceLines = useChartStore((s) => s.clearPriceLines);

  async function addLine(price: number, symbol: string) {
    if (user) {
      const id = await addPriceLineCloud(symbol, price);
      if (id) addPriceLineById(id, price, symbol);
    } else {
      addPriceLine(price, symbol);
    }
  }

  async function removeLine(id: string) {
    removePriceLine(id);
    if (user) await removePriceLineCloud(id);
  }

  async function clearLines(symbol?: string) {
    clearPriceLines(symbol);
    if (user) await clearPriceLinesCloud(symbol);
  }

  return { addLine, removeLine, clearLines };
}
