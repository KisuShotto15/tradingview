import type { IChartApi } from "lightweight-charts";

/**
 * Chart snapshots (PNG).
 *
 * `chart.takeScreenshot()` only paints lightweight-charts' own canvas — candles
 * and indicators. Everything the user annotated (drawings, order lines, key
 * levels) lives in SVG overlays stacked on top, so a snapshot has to composite
 * the two or it loses exactly what makes a setup worth keeping.
 *
 * The capture function is registered by PriceChart (same pattern as the
 * viewport applier and the nudge probe) so UI anywhere can trigger it without
 * holding a chart reference.
 */

let _capture: (() => Promise<Blob | null>) | null = null;

export function registerChartCapture(fn: () => Promise<Blob | null>) {
  _capture = fn;
}

/** PNG of the chart as it appears on screen, or null if unavailable. */
export function captureChart(): Promise<Blob | null> {
  return _capture?.() ?? Promise.resolve(null);
}

export function canCaptureChart(): boolean {
  return _capture !== null;
}

/**
 * Resolve `var(--token)` references to literal values.
 *
 * Serialized SVG is rasterized outside the document, so it no longer inherits
 * the custom properties our overlays paint with — every such colour would fall
 * back to black. Substituting up front keeps the snapshot true to the screen.
 */
function inlineCssVars(svgMarkup: string): string {
  const rootStyles = getComputedStyle(document.documentElement);
  return svgMarkup.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,
    (_full, name: string, fallback?: string) =>
      rootStyles.getPropertyValue(name).trim() || fallback?.trim() || "transparent",
  );
}

/** Rasterize one overlay `<svg>` at `width` x `height` CSS pixels. */
function svgToImage(svg: SVGSVGElement, width: number, height: number): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Serialized SVG has no layout context, so pin the size the overlay had.
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  const markup = inlineCssVars(new XMLSerializer().serializeToString(clone));
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("overlay rasterization failed"));
    img.src = url;
  });
}

/**
 * Composite the chart canvas with its SVG overlays into a PNG blob.
 *
 * `root` is the positioned wrapper holding both the chart container and the
 * overlays; every `<svg>` inside it is painted on top in DOM order, matching
 * what the user sees.
 */
export async function composeChartPng(
  chart: IChartApi,
  root: HTMLElement,
): Promise<Blob | null> {
  const base = chart.takeScreenshot();
  const out = document.createElement("canvas");
  out.width = base.width;
  out.height = base.height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(base, 0, 0);

  // takeScreenshot() renders at device-pixel resolution while the overlays are
  // laid out in CSS pixels — scale so they line up instead of landing small.
  const cssWidth = root.clientWidth;
  const cssHeight = root.clientHeight;
  if (cssWidth > 0 && cssHeight > 0) {
    const scale = base.width / cssWidth;
    for (const svg of Array.from(root.querySelectorAll("svg"))) {
      // Skip overlays that are hidden or have no box to paint.
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      try {
        const img = await svgToImage(svg, cssWidth, cssHeight);
        ctx.drawImage(img, 0, 0, cssWidth * scale, cssHeight * scale);
      } catch {
        // One unrenderable overlay shouldn't lose the whole snapshot.
      }
    }
  }

  return new Promise((resolve) => out.toBlob((b) => resolve(b), "image/png"));
}

/** Filename like `BTCUSDT.P_4h_2026-08-17T14-05.png`. */
export function snapshotFilename(symbol: string, timeframe: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(":", "-");
  return `${symbol.replace(/[^\w.-]/g, "_")}_${timeframe}_${stamp}.png`;
}
