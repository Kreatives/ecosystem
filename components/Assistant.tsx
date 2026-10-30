"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; acties?: { tool: string; resultaat: string }[] };

export function Assistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", content: "Hoi Ricky. Ik kan leads zoeken, verplaatsen, verwijderen of de funnel laten zien. Wat wil je?" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...msgs, { role: "user" as const, content: text }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "fout");
      setMsgs((m) => [...m, { role: "assistant", content: d.reply, acties: d.acties }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", content: `Er ging iets mis: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="asst-fab" onClick={() => setOpen((o) => !o)} aria-label="Assistent">
        {open ? "×" : <span className="asst-orb" />}
      </button>

      {open && (
        <div className="asst-panel">
          <header className="asst-head">
            <span className="asst-orb sm" /> Assistent
            <span className="asst-hint">verstuurt nooit berichten</span>
          </header>
          <div className="asst-msgs" ref={scrollRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`asst-msg ${m.role}`}>
                <div className="asst-bubble">{m.content}</div>
              </div>
            ))}
            {busy && <div className="asst-msg assistant"><div className="asst-bubble asst-typing">bezig…</div></div>}
          </div>
          <div className="asst-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="bijv. verwijder de lead Arnhem Dental"
              disabled={busy}
            />
            <button className="btn btn-primary" onClick={send} disabled={busy || !input.trim()}>Stuur</button>
          </div>
        </div>
      )}
    </>
  );
}
