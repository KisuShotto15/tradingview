import { beforeEach, describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { useReplayStore } from "./replay-store";

beforeEach(() => {
  useReplayStore.setState({
    active: false,
    picking: false,
    startIndex: 0,
    cursorIndex: 0,
    playing: false,
    speed: 3,
    total: 0,
  });
});

describe("replay-store", () => {
  it("enterPicking activates replay and enters pick mode", () => {
    useReplayStore.getState().enterPicking();
    const s = useReplayStore.getState();
    expect(s.active).toBe(true);
    expect(s.picking).toBe(true);
    expect(s.playing).toBe(false);
  });

  it("setStart clamps to [0, total-1] and sets cursor + startIndex", () => {
    useReplayStore.setState({ total: 100, picking: true });
    useReplayStore.getState().setStart(500);
    const s = useReplayStore.getState();
    expect(s.cursorIndex).toBe(99);
    expect(s.startIndex).toBe(99);
    expect(s.picking).toBe(false);
  });

  it("stepForward advances one bar and pauses at the last bar", () => {
    useReplayStore.setState({ total: 3, cursorIndex: 1, playing: true });
    useReplayStore.getState().stepForward();
    expect(useReplayStore.getState().cursorIndex).toBe(2);
    useReplayStore.getState().stepForward();
    expect(useReplayStore.getState().cursorIndex).toBe(2);
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("stepBackward floors at 0", () => {
    useReplayStore.setState({ total: 3, cursorIndex: 0 });
    useReplayStore.getState().stepBackward();
    expect(useReplayStore.getState().cursorIndex).toBe(0);
  });

  it("setTotal re-clamps the cursor into the new bounds", () => {
    useReplayStore.setState({ total: 100, cursorIndex: 90 });
    useReplayStore.getState().setTotal(50);
    expect(useReplayStore.getState().cursorIndex).toBe(49);
  });

  it("setCursor clamps to bounds", () => {
    useReplayStore.setState({ total: 10 });
    useReplayStore.getState().setCursor(999);
    expect(useReplayStore.getState().cursorIndex).toBe(9);
    useReplayStore.getState().setCursor(-5);
    expect(useReplayStore.getState().cursorIndex).toBe(0);
  });

  it("restart returns to startIndex and pauses", () => {
    useReplayStore.setState({ total: 100, startIndex: 20, cursorIndex: 55, playing: true });
    useReplayStore.getState().restart();
    expect(useReplayStore.getState().cursorIndex).toBe(20);
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("togglePlay flips playing", () => {
    useReplayStore.getState().togglePlay();
    expect(useReplayStore.getState().playing).toBe(true);
    useReplayStore.getState().togglePlay();
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("exit resets active/picking/playing", () => {
    useReplayStore.setState({ active: true, picking: true, playing: true });
    useReplayStore.getState().exit();
    const s = useReplayStore.getState();
    expect(s.active).toBe(false);
    expect(s.picking).toBe(false);
    expect(s.playing).toBe(false);
  });
});
