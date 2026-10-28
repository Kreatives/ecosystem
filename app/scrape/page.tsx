"use client";

import { useRef, useState } from "react";
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

function initialSteps(): Record<string, StepInfo> {
  return Object.fromEntries(STEP_DEFS.map((s) => [s.key, { state: "upcoming" as StepState, errors: [] }]));
}

export default function ScrapePage() {
  const [prompt, setPrompt] = useState("");
  const [aantal, setAantal] = useState(10);
  const [type, setType] = useState<"client" | "partner">("client");
  const [platform, setPlatform] = useState<"linkedin" | "instagram" | "beide">("beide");
  const [dryRun, setDryRun] = useState(false);

  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<string, StepInfo>>(initialSteps());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const pipelineSteps: PipelineStep[] = STEP_DEFS.map((d) => ({
    key: d.key,
    title: d.title,
    state: steps[d.key].state,
    counter: steps[d.key].counter,
    errors: steps[d.key].errors,
  }));

  async function start() {
    if (!prompt.trim() || running) return;
    setError(null);
    setSummary(null);
    setSteps(initialSteps());
    setRunning(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: prompt, aantal, type, platform, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Starten mislukt");

      const es = new EventSource(`/api/run/${data.jobId}/events`);
      esRef.current = es;
      es.onmessage = (ev) => {
        const e = JSON.parse(ev.data);
        if (e.kind === "step") {
          setSteps((prev) => ({ ...prev, [e.key]: { ...prev[e.key], state: e.state, counter: e.counter } }));
        } else if (e.kind === "leaderror") {
          setSteps((prev) => ({
            ...prev,
            [e.key]: { ...prev[e.key], errors: [...prev[e.key].errors, { naam: e.naam, reden: e.reden }] },
          }));
        } else if (e.kind === "done") {
          setSummary(e.summary);
          setRunning(false);
          es.close();
        } else if (e.kind === "error") {
          setError(e.msg);
          setRunning(false);
          es.close();
        }
      };
      es.onerror = () => {
        es.close();
        setRunning(false);
      };
    } catch (e: any) {
      setError(e.message);
      setRunning(false);
    }
  }

  function reset() {
    esRef.current?.close();
    setSteps(initialSteps());
    setSummary(null);
    setError(null);
    setRunning(false);
  }

  const started = running || summary !== null || error !== null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Nieuwe run</div>
          <div className="page-sub">
            Beschrijf wie je zoekt. Claude vertaalt dat naar zoekopdrachten voor Apify.
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
        </div>
      </div>

      {started && <Pipeline steps={pipelineSteps} />}

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
