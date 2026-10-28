export default function StatsPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Statistieken</div>
          <div className="page-sub">Funnel per week en totaal, klant en partner apart.</div>
        </div>
      </div>
      <div className="notice">
        <h3>Komt in fase 6</h3>
        De verstuurdatums komen uit het event-log in de eigen database (het moment waarop{" "}
        <code>Sent</code> of een <code>F</code> werd aangevinkt). Dat log wordt vanaf fase 1 al
        gevuld bij elke actie en bij elke sync, zodat de cijfers later kloppen.
      </div>
    </>
  );
}
