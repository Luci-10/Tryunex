import Sheet from "./ui/Sheet";
import Button from "./ui/Button";
import { Camera } from "./ui/icons";

/**
 * Shown once, the first time a user taps an upload area on a touch device.
 * Explains what's about to happen, then gets out of the way forever.
 */
export default function PhotoAccessPrompt({
  open,
  onCancel,
  onContinue,
}: {
  open: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title="Access your photos?"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" block onClick={onCancel}>
            Not now
          </Button>
          <Button block onClick={onContinue}>
            Continue
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <span className="w-14 h-14 rounded-full bg-lilac text-brand-600 grid place-items-center">
          <Camera className="w-7 h-7" />
        </span>
        <p className="text-sm text-ink/70 leading-relaxed max-w-xs">
          TryUnex will open your phone's photo picker so you can choose an existing picture or take
          a new one. We only upload the image you select — nothing else.
        </p>
      </div>
    </Sheet>
  );
}
