import { isNativeApp } from "./platform";

export type PickSource = "gallery" | "camera";

export type PickResult =
  | { ok: true; file: File }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "denied"; message: string }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "failed"; message: string };

/**
 * On the web there is no API to ask for "full" versus "limited" photo access —
 * clicking a file input *is* the grant, and the browser/OS picker decides what
 * it exposes. So the web path is just the file input, and the UI must not
 * claim otherwise.
 *
 * Inside the Capacitor app the official Camera plugin gives us the real OS
 * flow, including Android's photo picker and iOS's limited-selection sheet.
 * The plugin is loaded dynamically: if the native half isn't installed in a
 * given build, we report `unavailable` and the caller falls back to the input.
 */
export function nativePickerAvailable(): boolean {
  return isNativeApp();
}

export async function pickPhotoNatively(source: PickSource): Promise<PickResult> {
  if (!isNativeApp()) return { ok: false, reason: "unavailable" };

  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");

    // Ask the OS only for what we're about to use. On Android 13+ and iOS this
    // surfaces the system picker, which can hand back a single selected photo
    // without granting access to the whole library — we never ask for more.
    const wanted = source === "camera" ? "camera" : "photos";
    try {
      const status = await Camera.checkPermissions();
      const current = source === "camera" ? status.camera : status.photos;
      if (current !== "granted" && current !== "limited") {
        const asked = await Camera.requestPermissions({ permissions: [wanted as any] });
        const after = source === "camera" ? asked.camera : asked.photos;
        if (after === "denied") {
          return {
            ok: false,
            reason: "denied",
            message:
              source === "camera"
                ? "Camera access is off for TryUnex. You can turn it on in your device settings."
                : "Photo access is off for TryUnex. You can turn it on in your device settings.",
          };
        }
        // "limited" is a perfectly good answer — the user picked what to share.
      }
    } catch {
      // Some platforms (and the web build of the plugin) don't implement the
      // permission API at all. Fall through and let getPhoto ask.
    }

    const photo = await Camera.getPhoto({
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.Uri,
      quality: 90,
      allowEditing: false,
      correctOrientation: true,
    });

    if (!photo.webPath) return { ok: false, reason: "failed", message: "No image was returned" };

    const blob = await (await fetch(photo.webPath)).blob();
    const ext = photo.format || "jpeg";
    const file = new File([blob], `photo.${ext}`, { type: blob.type || `image/${ext}` });
    return { ok: true, file };
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "");
    // The plugin throws for a cancelled picker as well as for real failures;
    // these are the strings Capacitor uses across platforms.
    if (/cancell?ed|User cancelled/i.test(msg)) return { ok: false, reason: "cancelled" };
    if (/not implemented|unavailable|not available/i.test(msg)) {
      return { ok: false, reason: "unavailable" };
    }
    if (/denied|permission/i.test(msg)) {
      return { ok: false, reason: "denied", message: "TryUnex doesn't have access to your photos." };
    }
    if (/no camera|camera not available/i.test(msg)) {
      return { ok: false, reason: "failed", message: "This device has no camera available." };
    }
    return { ok: false, reason: "failed", message: msg || "Could not open the picker" };
  }
}
