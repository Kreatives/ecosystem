"use client";

import { useCallback, useEffect, useState } from "react";

type Step = { berichtLabel: string | null; action: string; actionLabel: string; waarom: string };
type Item = {
  id: string; naam: string; status: string | null; date: string | null;
  niche: string; platform: string; outreach: string; website: string; notionUrl: string;
  step: Step | null; bericht: string;
};
type Data = { vandaag: Item[]; nogTeStarten: Item[]; nogTeStartenTotaal: number; straks: Item[] };

export function Vandaag() {
  const [type, setType] = useState<"client" | "partner">("client");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (t: "client" | "partner") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vandaag?type=${t}`, { cache: "no-store" });
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

  async function act(id: string, action: string, step?: string, extra?: any) {
    setBusy(id);
    try {
      const body: any = { type, action, ...extra };
      if (action === "followup") body.step = step;
      const res = await fetch(`/api/leads/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await load(type);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  function copy(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  }

  function Card({ it, start }: { it: Item; start?: boolean }) {
    const repliable = it.status === "Day 2" || it.status === "Day 3";
    return (
      <article className="fu-card">
        <div className="fu-head">
          <div>
            <span className="fu-name">{it.naam}</span>
            <span className="fu-meta">{it.status}{it.date ? ` · ${it.date}` : ""}{it.niche ? ` · ${it.niche}` : ""}</span>
          </div>
          <div className="lead-links">
            {it.outreach && <a href={it.outreach} target="_blank" rel="noreferrer">Outreach</a>}
            <a href={it.notionUrl} target="_blank" rel="noreferrer">Notion</a>
          </div>
        </div>
        {it.step && <div className="fu-why">{it.step.waarom}</div>}
        {it.bericht && (
          <div className="fu-msg">
            <pre>{it.bericht}</pre>
            <button className="btn" onClick={() => copy(it.id, it.bericht)}>
              {copied === it.id ? "Gekopieerd" : "Kopieer bericht"}
            </button>
          </div>
        )}
        {it.step && it.step.berichtLabel && !it.bericht && (
          <div className="fu-why">Bericht staat in de Notion-pagina (open via de link).</div>
        )}
        <div className="fu-actions">
          {it.step && (
            <button className="btn btn-primary" disabled={busy === it.id} onClick={() => act(it.id, "followup", it.step!.action)}>
              {it.step.actionLabel}
            </button>
          )}
          {repliable && (
            <button className="btn" disabled={busy === it.id} onClick={() => act(it.id, "checkbox", undefined, { key: "Replied", value: true })}>
              Markeer als gereageerd
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Vandaag</div>
          <div className="page-sub">Wat er vandaag klaarstaat om te versturen. Jij verstuurt, de app vinkt af.</div>
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
        <div className="fu-cols">
          <section className="fu-col">
            <h3 className="fu-coltitle">Vandaag <span>{data.vandaag.length}</span></h3>
            {data.vandaag.length === 0 && <div className="empty-col">niets te versturen</div>}
            {data.vandaag.map((it) => <Card key={it.id} it={it} />)}
          </section>
          <section className="fu-col">
            <h3 className="fu-coltitle">Nog te starten <span>{data.nogTeStartenTotaal}</span></h3>
            {data.nogTeStarten.length === 0 && <div className="empty-col">leeg</div>}
            {data.nogTeStarten.map((it) => <Card key={it.id} it={it} start />)}
          </section>
          <section className="fu-col">
            <h3 className="fu-coltitle">Komende 7 dagen <span>{data.straks.length}</span></h3>
            {data.straks.length === 0 && <div className="empty-col">leeg</div>}
            {data.straks.map((it) => (
              <article key={it.id} className="fu-card fu-slim">
                <div className="fu-head">
                  <div><span className="fu-name">{it.naam}</span><span className="fu-meta">{it.status} · {it.date}</span></div>
                  <a href={it.notionUrl} target="_blank" rel="noreferrer" className="lead-links">Notion</a>
                </div>
                {it.step && <div className="fu-why">{it.step.waarom}</div>}
              </article>
            ))}
          </section>
        </div>
      ) : null}
    </>
  );
}
