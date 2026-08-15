/**
 * Dims everything except the target. Four panels are drawn around the target
 * rect rather than one overlay with a hole, so the control underneath stays a
 * normal, clickable control — the tour never intercepts the real interaction.
 */
export default function TourSpotlight({ rect }: { rect: DOMRect | null }) {
  if (!rect) {
    return <div className="fixed inset-0 z-[80] bg-ink/50 animate-fade-in" aria-hidden />;
  }
  const pad = 8;
  const top = Math.max(0, rect.top - pad);
  const left = Math.max(0, rect.left - pad);
  const right = rect.right + pad;
  const bottom = rect.bottom + pad;
  const panel = "fixed bg-ink/50 z-[80]";

  return (
    <div aria-hidden className="animate-fade-in">
      <div className={panel} style={{ top: 0, left: 0, right: 0, height: top }} />
      <div className={panel} style={{ top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div className={panel} style={{ top, left: 0, width: left, height: bottom - top }} />
      <div className={panel} style={{ top, left: right, right: 0, height: bottom - top }} />
      {/* Ring only — no backdrop, so pointer events reach the control. */}
      <div
        className="fixed z-[81] rounded-xl ring-2 ring-white/90 shadow-[0_0_0_4px_rgba(118,87,232,0.45)] pointer-events-none"
        style={{ top, left, width: right - left, height: bottom - top }}
      />
    </div>
  );
}
