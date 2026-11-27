/**
 * A short haptic tick, best effort.
 *
 * Android browsers have the Vibration API. Safari on iOS does not, but since
 * iOS 18 toggling an `<input type="checkbox" switch>` plays the system's
 * selection tick, and a click on its label does that from script — the
 * fallback here. Where neither exists this does nothing, which is the right
 * failure for a nicety.
 */
let iosSwitch: HTMLLabelElement | null = null;

export function hapticTick(ms = 8): void {
  if (typeof window === "undefined") return;
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(ms);
    return;
  }
  try {
    if (!iosSwitch) {
      const label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      label.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      iosSwitch = label;
    }
    iosSwitch.click();
  } catch {
    /* no haptics on this device */
  }
}
