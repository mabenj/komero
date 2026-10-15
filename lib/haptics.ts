let iosSwitch: HTMLLabelElement | undefined;

/**
 * One short haptic tap, e.g. when a barcode is read. Does nothing where the
 * phone can't do it.
 */
export function haptic() {
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
      return;
    }
    // iOS Safari has no Vibration API, but since Safari 18 it plays the system
    // haptic when a switch (`<input type="checkbox" switch>`) is toggled, also
    // through a click on its label. This is undocumented and may stop working
    // in a later iOS; the visual feedback must stand on its own.
    if (!iosSwitch) {
      iosSwitch = document.createElement("label");
      iosSwitch.ariaHidden = "true";
      iosSwitch.style.display = "none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      iosSwitch.append(input);
      document.body.append(iosSwitch);
    }
    iosSwitch.click();
  } catch {
    // No haptics here.
  }
}
