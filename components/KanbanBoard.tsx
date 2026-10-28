"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Lead = {
  id: string;
  type: "client" | "partner";
  naam: string;
  website: string;
  outreach: string;
  niche: string;
  platform: string;
  score: number | null;
  status: string | null;
  date: string | null;
  column: string;
  notionUrl: string;
};

type Counts = { notion: number; shown: number; drift: number };

const COLUMNS: Record<"client" | "partner", string[]> = {
  client: ["Nog niet gestart", "Sent", "Opened", "Replied", "Gesprek", "Booked", "Closed"],
  partner: ["Nog niet gestart", "Sent", "Opened", "Replied", "Booked", "Closed"],
};

export function KanbanBoard() {
  const [type, setType] = useState<"client" | "partner">("client");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const load = useCallback(async (t: "client" | "partner") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads?type=${t}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Laden mislukt");
      setLeads(data.leads);
      setCounts(data.counts);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(type);
  }, [type, load]);

  const byColumn = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const col of COLUMNS[type]) map[col] = [];
    for (const l of leads) (map[l.column] ||= []).push(l);
    return map;
  }, [leads, type]);

  async function drop(column: string) {
    const id = dragId;
    setOverCol(null);
    setDragId(null);
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.column === column) return;

    // optimistisch
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, column } : l)));
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, action: "move", column }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)));
    } catch (e: any) {
      setError(`Verplaatsen mislukt: ${e.message}`);
      load(type); // terug naar de waarheid in Notion
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Kanban</div>
          <div className="page-sub">
            Hoogste aangevinkte checkbox bepaalt de kolom. Slepen schrijft terug naar Notion.
          </div>
        </div>
        <div className="row">
          {counts && (
            <span className="count-pill" data-drift={counts.drift !== 0}>
              {counts.notion} in Notion{counts.drift !== 0 ? ` · afwijking ${counts.drift}` : ""}
            </span>
          )}
          <div className="segment">
            <button data-active={type === "client"} onClick={() => setType("client")}>
              Klanten
            </button>
            <button data-active={type === "partner"} onClick={() => setType("partner")}>
              Partners
            </button>
          </div>
          <button className="btn" onClick={() => load(type)} disabled={loading}>
            {loading ? "Synct…" : "Sync"}
          </button>
        </div>
      </div>

      {error && (
        <div className="notice" style={{ marginBottom: "var(--s-6)" }}>
          {error}
        </div>
      )}

      {loading && leads.length === 0 ? (
        <div className="loading">Leads laden uit Notion…</div>
      ) : (
        <div className="board">
          {COLUMNS[type].map((col) => (
            <section
              key={col}
              className="column"
              data-over={overCol === col}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col);
              }}
              onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
              onDrop={() => drop(col)}
            >
              <header className="column-head">
                <span className="column-name">{col}</span>
                <span className="column-count">{byColumn[col]?.length ?? 0}</span>
              </header>
              <div className="column-body">
                {(byColumn[col] ?? []).map((l) => (
                  <article
                    key={l.id}
                    className="lead-card"
                    draggable
                    data-dragging={dragId === l.id}
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                  >
                    <div className="lead-top">
                      <span className="lead-name">{l.naam || "Naamloos"}</span>
                      {l.score != null && <span className="lead-score">{l.score}</span>}
                    </div>
                    <div className="lead-meta">
                      {l.niche && <span className="lead-tag">{l.niche}</span>}
                      {l.platform && <span className="lead-tag">{l.platform}</span>}
                    </div>
                    {(l.status || l.date) && (
                      <div className="lead-status">
                        {l.status || "—"}
                        {l.date ? ` · ${l.date}` : ""}
                      </div>
                    )}
                    <div className="lead-links">
                      {l.outreach && (
                        <a href={l.outreach} target="_blank" rel="noreferrer">
                          Outreach
                        </a>
                      )}
                      {l.website && (
                        <a href={l.website} target="_blank" rel="noreferrer">
                          Site
                        </a>
                      )}
                      <a href={l.notionUrl} target="_blank" rel="noreferrer">
                        Notion
                      </a>
                    </div>
                  </article>
                ))}
                {(byColumn[col] ?? []).length === 0 && <div className="empty-col">leeg</div>}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
