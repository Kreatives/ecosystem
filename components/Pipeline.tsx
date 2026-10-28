/**
 * Verticale pipeline van het run-scherm (zie context/pipeline-ref.png): grote
 * lichte cirkel links, label rechts, dunne verbindingslijn met pijl ertussen.
 * De actieve stap toont de orb; komende stappen zijn gedimd; klare stappen
 * krijgen een vaste cirkel met vinkje. Puur presentational: de voortgang komt
 * van echte job-status (fase 5), niet van een eigen animatie.
 */
import { Orb } from "./Orb";

export type StepState = "upcoming" | "active" | "done";

export type PipelineStep = {
  key: string;
  title: string;
  state: StepState;
  counter?: string; // "12 / 34 — 7 door, 5 weggegooid"
  errors?: { naam: string; reden: string }[];
};

function Check() {
  return (
    <svg className="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Pipeline({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="pipeline">
      {steps.map((step, i) => (
        <div key={step.key}>
          <div className="pipeline-step" data-state={step.state}>
            <div className="pipeline-node">
              {step.state === "active" ? (
                <Orb />
              ) : (
                <div className="disc" data-state={step.state}>
                  {step.state === "done" && <Check />}
                </div>
              )}
            </div>
            <div className="pipeline-label">
              <span className="title">{step.title}</span>
              {step.counter && <span className="counter">{step.counter}</span>}
              {step.errors?.map((e, j) => (
                <span className="errors" key={j}>
                  {e.naam}: {e.reden}
                </span>
              ))}
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className="pipeline-connector">
              <span />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
