"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pipeline, type PipelineStep, type StepState } from "@/components/Pipeline";

const STEP_DEFS: { key: string; title: string }[] = [
  { key: "scrape", title: "Scraping leads" },
  { key: "qualify", title: "Qualifying leads" },
  { key: "analyse", title: "Analysing websites" },
  { key: "write", title: "Writing outreach" },
];

type StepInfo = { state: StepState; counter?: string; errors: { naam: string; reden: string }[] };
type Summary = { gevonden: number; gekwalificeerd: number; weggegooid: number; naarNotion: number; seconden: number };
type Status = { status: "running" | "done" | "error"; steps: Record<string, StepInfo>; summary: Summary | null; error: string | null; logs: string[] };

const STORE_KEY = "keco-active-run";

function toPipeline(steps: Record<string, StepInfo>): PipelineStep[] {
  return STEP_DEFS.map((d) => ({
    key: d.key,
    title: d.title,
    state: steps[d.key]?.state || "upcoming",
    counter: steps[d.key]?.counter,
    errors: steps[d.key]?.errors || [],
  }));
}

export default function ScrapePage() {
  const [prompt, setPrompt] = useState("");
  const [aantal, setAantal] = useState(10);
  const [type, setType] = useState<"client" | "partner">("client");
  const [platform, setPlatform] = useState<"linkedin" | "instagram" | "beide">("beide");
  const [dryRun, setDryRun] = useState(false);

  const [running, setRunning] = useState(false);
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/run/${jobId}/status`, { cache: "no-store" });
      const d: Status = await res.json();
      if (!res.ok) throw new Error((d as any).error || "status onbekend");
      setData(d);
      if (d.status === "running") {
        timer.current = setTimeout(() => poll(jobId), 2000);
      } else {
        setRunning(false);
        localStorage.removeItem(STORE_KEY);
        if (d.status === "error") setError(d.error || "run mislukt");
      }
    } catch (e: any) {
      // tijdelijke hapering: blijf proberen
      timer.current = setTimeout(() => poll(jobId), 3000);
    }
  }, []);

  // Bij laden: loopt er nog een run? Pak 'm weer op.
  useEffect(() => {
    const jobId = typeof window !== "undefined" ? localStorage.getItem(STORE_KEY) : null;
    if (jobId) {
      setRunning(true);
      poll(jobId);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  async function start() {
    if (!prompt.trim() || running) return;
    setError(null);
    setData(null);
    setRunning(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: prompt, aantal, type, platform, dryRun }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Starten mislukt");
      localStorage.setItem(STORE_KEY, d.jobId);
      poll(d.jobId);
    } catch (e: any) {
      setError(e.message);
      setRunning(false);
    }
  }

  function reset() {
    if (timer.current) clearTimeout(timer.current);
    localStorage.removeItem(STORE_KEY);
    setData(null);
    setError(null);
    setRunning(false);
  }

  const started = running || data !== null || error !== null;
  const summary = data?.status === "done" ? data.summary : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Nieuwe run</div>
          <div className="page-sub">
            Beschrijf wie je zoekt. De run draait door op de achtergrond, ook als je wegklikt.
          </div>
        </div>
      </div>

      <div className="run-form">
        <div className="field">
          <label htmlFor="prompt">Opdracht</label>
          <textarea
            id="prompt"
            placeholder="zoek organisatieadviesbureaus in Utrecht en Amsterdam met 5–30 medewerkers die recent een marketeer hebben aangenomen"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={running}
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="aantal">Aantal leads</label>
            <input id="aantal" type="number" min={1} max={50} value={aantal} onChange={(e) => setAantal(Number(e.target.value))} disabled={running} />
          </div>
          <div className="field">
            <label htmlFor="type">Type</label>
            <select id="type" value={type} onChange={(e) => setType(e.target.value as any)} disabled={running}>
              <option value="client">Klant</option>
              <option value="partner">Partner</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="platform">Platform</label>
            <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value as any)} disabled={running}>
              <option value="linkedin">LinkedIn</option>
              <option value="instagram">Instagram</option>
              <option value="beide">Beide</option>
            </select>
          </div>
        </div>
        <label className="run-dry">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} disabled={running} />
          Testrun — scrape en kwalificeer, maar schrijf niets naar Notion
        </label>
        <div className="run-actions">
          <button className="btn btn-primary" onClick={start} disabled={running || !prompt.trim()}>
            {running ? "Bezig…" : "Start run"}
          </button>
          {started && !running && (
            <button className="btn" onClick={reset}>
              Nieuwe run
            </button>
          )}
          {running && <span className="run-note">Je kunt wegklikken — de run loopt door.</span>}
        </div>
      </div>

      {started && data && <Pipeline steps={toPipeline(data.steps)} />}

      {summary && (
        <div className="run-summary">
          <strong>{summary.gevonden}</strong> gevonden ·{" "}
          <strong>{summary.gekwalificeerd}</strong> gekwalificeerd ·{" "}
          <strong>{summary.weggegooid}</strong> weggegooid ·{" "}
          <strong>{summary.naarNotion}</strong> naar Notion · {summary.seconden}s
          <div className="run-actions">
            <Link className="btn btn-primary" href="/">
              Bekijk in Kanban
            </Link>
          </div>
        </div>
      )}

      {error && <div className="notice" style={{ marginTop: "var(--s-6)" }}>Run gestopt: {error}</div>}
    </>
  );
}
