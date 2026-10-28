export default function VandaagPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Vandaag</div>
          <div className="page-sub">Follow-ups die vandaag of eerder open staan.</div>
        </div>
      </div>
      <div className="notice">
        <h3>Komt in fase 6</h3>
        Het dagoverzicht toont straks elke lead waarvan <code>Date</code> ≤ vandaag en de status
        niet <code>Geen reactie</code> of <code>Afgerond</code> is, met het bericht dat nu klaar
        staat en een kopieerknop. De follow-up-engine (Date/Status/F1–F3) staat al in fase 1 en
        wordt hier zichtbaar gemaakt.
      </div>
    </>
  );
}
