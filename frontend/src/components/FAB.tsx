export default function FAB({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Add a piece"
      className="fixed bottom-5 right-5 z-20 w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-lg flex items-center justify-center text-3xl leading-none transition-transform active:scale-95"
    >
      +
    </button>
  );
}
