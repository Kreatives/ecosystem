"use client";

import { useCallback, useEffect, useState } from "react";

type Data = {
  funnel: string[];
  totaal: Record<string, number>;
  conversies: Record<string, number>;
  perWeek: Record<string, any>[];
};

export function Stats() {
  const [type, setType] = useState<"client" | "partner">("client");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: "client" | "partner") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stats?type=${t}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Laden mislukt");
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(type); }, [type, load]);

  const cols = data ? ["gescrapet", "gekwalificeerd", ...data.funnel] : [];
  const label: Record<string, string> = {
    gescrapet: "Gescrapet", gekwalificeerd: "Gekwalificeerd (6+)",
    Sent: "Sent", Opened: "Opened", Replied: "Replied", Gesprek: "Gesprek", Booked: "Booked", Closed: "Closed",
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Statistieken</div>
          <div className="page-sub">Funnel totaal en per week. Verstuurdatums uit het event-log.</div>
        </div>
        <div className="segment">
          <button data-active={type === "client"} onClick={() => setType("client")}>Klanten</button>
          <button data-active={type === "partner"} onClick={() => setType("partner")}>Partners</button>
        </div>
      </div>

      {error && <div className="notice" style={{ marginBottom: "var(--s-6)" }}>{error}</div>}
      {loading && !data ? (
        <div className="loading">Laden…</div>
      ) : data ? (
        <>
          <div className="stat-grid">
            {cols.map((c) => (
              <div key={c} className="stat-cell">
                <div className="stat-num">{data.totaal[c] ?? 0}</div>
                <div className="stat-lbl">{label[c] || c}</div>
              </div>
            ))}
          </div>

          <h3 className="fu-coltitle" style={{ marginTop: "var(--s-8)" }}>Conversie</h3>
          <div className="conv-row">
            {Object.entries(data.conversies).map(([k, v]) => (
              <span key={k} className="conv-pill">{k.replace("→", " → ")}: <strong>{v}%</strong></span>
            ))}
          </div>

          <h3 className="fu-coltitle" style={{ marginTop: "var(--s-8)" }}>Per week</h3>
          {data.perWeek.length === 0 ? (
            <div className="empty-col" style={{ textAlign: "left" }}>Nog geen weekdata. Dit vult zich zodra je leads verstuurt (checkboxes aanvinkt) of runs draait.</div>
          ) : (
            <div className="table-wrap">
              <table className="stat-table">
                <thead>
                  <tr><th>Week</th>{cols.map((c) => <th key={c}>{label[c] || c}</th>)}</tr>
                </thead>
                <tbody>
                  {data.perWeek.map((w) => (
                    <tr key={w.week}><td>{w.week}</td>{cols.map((c) => <td key={c}>{w[c] ?? 0}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
