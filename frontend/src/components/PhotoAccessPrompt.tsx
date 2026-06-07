// Friendly modal shown the first time a user taps an upload area.
// Explains what'll happen, asks for consent, then opens the picker.
export default function PhotoAccessPrompt({
  open,
  onCancel,
  onContinue,
}: {
  open: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-3xl">📷</div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Access your photos?</h2>
          <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
            TryUnex will open your phone's photo picker so you can choose an existing
            picture or take a new one. We only upload the image you select — nothing else.
          </p>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg py-2.5 font-medium"
          >
            Not now
          </button>
          <button
            onClick={onContinue}
            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2.5 font-medium"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
