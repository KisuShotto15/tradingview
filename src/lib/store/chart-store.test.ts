import { beforeEach, describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { useChartStore } from "./chart-store";

beforeEach(() => {
  useChartStore.setState({ favoriteTools: [] });
});

describe("chart-store favorites", () => {
  it("toggles a tool on then off", () => {
    useChartStore.getState().toggleFavoriteTool("trendline");
    expect(useChartStore.getState().favoriteTools).toContain("trendline");
    useChartStore.getState().toggleFavoriteTool("trendline");
    expect(useChartStore.getState().favoriteTools).not.toContain("trendline");
  });

  it("keeps multiple favorites in insertion order", () => {
    useChartStore.getState().toggleFavoriteTool("trendline");
    useChartStore.getState().toggleFavoriteTool("text");
    useChartStore.getState().toggleFavoriteTool("arrow");
    expect(useChartStore.getState().favoriteTools).toEqual(["trendline", "text", "arrow"]);
  });

  it("removing a middle favorite preserves the rest", () => {
    useChartStore.getState().toggleFavoriteTool("trendline");
    useChartStore.getState().toggleFavoriteTool("text");
    useChartStore.getState().toggleFavoriteTool("arrow");
    useChartStore.getState().toggleFavoriteTool("text");
    expect(useChartStore.getState().favoriteTools).toEqual(["trendline", "arrow"]);
  });
});
