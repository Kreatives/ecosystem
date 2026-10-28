"use client";

import { useState } from "react";
import { Pipeline, type PipelineStep } from "@/components/Pipeline";

// Voorbeeldstaat zodat de vormgeving (done-node, opgelichte lijn, orb, tellers)
// zichtbaar is. De echte tellers en voortgang komen via SSE in fase 5.
const STEPS: PipelineStep[] = [
  { key: "scrape", title: "Scraping leads", state: "done", counter: "34 gevonden" },
  { key: "qualify", title: "Qualifying leads", state: "active", counter: "12 / 34 — 7 door, 5 weggegooid" },
  { key: "analyse", title: "Analysing websites", state: "upcoming" },
  { key: "write", title: "Writing outreach", state: "upcoming" },
];

export default function ScrapePage() {
  const [prompt, setPrompt] = useState("");
  const [aantal, setAantal] = useState(10);
  const [type, setType] = useState<"client" | "partner">("client");
  const [platform, setPlatform] = useState("beide");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Nieuwe run</div>
          <div className="page-sub">
            Beschrijf wie je zoekt. Claude vertaalt dat naar zoekopdrachten voor Apify en Deep API.
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
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="aantal">Aantal leads</label>
            <input
              id="aantal"
              type="number"
              min={1}
              max={50}
              value={aantal}
              onChange={(e) => setAantal(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="type">Type</label>
            <select id="type" value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="client">Klant</option>
              <option value="partner">Partner</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="platform">Platform</label>
            <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="linkedin">LinkedIn</option>
              <option value="instagram">Instagram</option>
              <option value="beide">Beide</option>
            </select>
          </div>
        </div>
        <div className="run-actions">
          <button className="btn" disabled title="De run-engine komt in fase 5">
            Start run
          </button>
        </div>
      </div>

      <Pipeline steps={STEPS} />

      <p className="run-total">
        Voorbeeld van het run-scherm. De live voortgang (SSE, echte tellers per stap, foutmarkers
        per lead) wordt gekoppeld in fase 5, samen met de scraper.
      </p>
    </>
  );
}
