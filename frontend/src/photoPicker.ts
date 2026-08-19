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

    // Camera permission logic.
    if (source === "camera") {
      const status = await Camera.checkPermissions();
      if (status.camera === "denied") {
        return {
          ok: false,
          reason: "denied",
          message: "Camera access is off for TryUnex. You can turn it on in your device settings to take photos of your clothes.",
        };
      }
      if (status.camera !== "granted") {
        const asked = await Camera.requestPermissions({ permissions: ["camera"] });
        if (asked.camera !== "granted") {
          return {
            ok: false,
            reason: "denied",
            message: "Camera access is required to take photos. Please allow it when asked, or enable it in Settings.",
          };
        }
      }
    } else {
      // Photos / Gallery logic. On Android 13+ and iOS, the system picker
      // often doesn't need broad "photos" permission if it's the official
      // picker, but we check/request anyway for compatibility with older
      // versions and the Capacitor plugin's expectations.
      const status = await Camera.checkPermissions();
      if (status.photos === "denied") {
        return {
          ok: false,
          reason: "denied",
          message: "Photo access is off for TryUnex. You can turn it on in your device settings to pick from your gallery.",
        };
      }
      // If prompt, we request. If limited (iOS), we proceed.
      if (status.photos !== "granted" && status.photos !== "limited") {
        const asked = await Camera.requestPermissions({ permissions: ["photos"] });
        if (asked.photos === "denied") {
          // If they just cancelled the dialog, we'll see it in the error catch.
          // If they explicitly denied, we report it.
          return {
            ok: false,
            reason: "denied",
            message: "Photo access is required to pick images from your gallery.",
          };
        }
      }
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
