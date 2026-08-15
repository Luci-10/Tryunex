import Sheet from "./ui/Sheet";
import Button from "./ui/Button";
import { Camera, Check, Shirt } from "./ui/icons";
import { nativePickerAvailable } from "../photoPicker";

/**
 * Shown once, the first time someone taps an upload area on a touch device.
 *
 * On the web the browser owns the picker entirely — a site can't ask for
 * "limited" versus "full" library access — so this explains what will happen
 * and gets out of the way. In the app we can offer camera or gallery up
 * front, and the OS then runs its own permission flow.
 */
export default function PhotoAccessPrompt({
  open,
  onCancel,
  onContinue,
}: {
  open: boolean;
  onCancel: () => void;
  /** `source` is only meaningful in the native app. */
  onContinue: (source: "gallery" | "camera") => void;
}) {
  const native = nativePickerAvailable();

  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={native ? "Add a photo" : "Access your photos?"}
      footer={
        native ? (
          <div className="space-y-2">
            <Button block onClick={() => onContinue("gallery")} leading={<Shirt className="w-4 h-4" />}>
              Choose from photos
            </Button>
            <Button
              block
              variant="secondary"
              onClick={() => onContinue("camera")}
              leading={<Camera className="w-4 h-4" />}
            >
              Take a photo
            </Button>
            <Button block variant="quiet" onClick={onCancel}>
              Not now
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={onCancel}>
              Not now
            </Button>
            <Button block onClick={() => onContinue("gallery")}>
              Continue
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col items-center text-center gap-3 py-1">
        <span className="w-14 h-14 rounded-full bg-lilac text-brand-600 grid place-items-center">
          <Camera className="w-7 h-7" />
        </span>
        <ul className="text-left space-y-2 text-[13.5px] text-ink/75 max-w-xs">
          <Point>
            {native
              ? "Your device asks for permission, and shows its own picker."
              : "TryUnex will open your phone's photo picker."}
          </Point>
          <Point>You choose exactly which photo to share.</Point>
          <Point>We only upload the image you select.</Point>
        </ul>
      </div>
    </Sheet>
  );
}

function Point({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
      <span className="leading-snug">{children}</span>
    </li>
  );
}
