"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const LINKS = [
  { href: "/kanban", label: "Kanban" },
  { href: "/vandaag", label: "Vandaag" },
  { href: "/scrape", label: "Nieuwe run" },
  { href: "/stats", label: "Statistieken" },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        KREATIVES
        <span>Outreach ecosystem</span>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: "var(--s-1)" }}>
        {LINKS.map((l) => {
          const active = path === l.href || (l.href !== "/kanban" && path.startsWith(l.href));
          return (
            <Link key={l.href} href={l.href} className="nav-link" data-active={active}>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-foot">Notion is leidend. De app verstuurt niets.</div>
    </aside>
  );
}
