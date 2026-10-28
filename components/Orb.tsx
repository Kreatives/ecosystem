/**
 * Zachte, langzaam ademende gloed met concentrische ringen (pure CSS, geen video,
 * geen lib). Staat op de actieve pipeline-stap. Zie context/orb-ref.png.
 */
export function Orb() {
  return (
    <div className="orb" aria-hidden="true">
      <div className="ring r1" />
      <div className="ring r2" />
      <div className="ring r3" />
      <div className="core" />
    </div>
  );
}
