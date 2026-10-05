"use client";

import { X } from "lucide-react";
import { useId, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Msg } from "@/lib/i18n";

export type Person = { id: string; name: string; email: string; team: Msg | null };

/** Multi-select of people, searchable by name, email or department. Submits one `name` value per selected person. */
export function PeoplePicker({
  label,
  name,
  people,
  initial = [],
}: {
  label: string;
  name: string;
  people: Person[];
  initial?: string[];
}) {
  const { t } = useI18n();
  const id = useId();
  const [selected, setSelected] = useState<string[]>(initial.filter((i) => people.some((p) => p.id === i)));
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const matches = people.filter(
    (p) =>
      !selected.includes(p.id) &&
      (!q ||
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.team && t(p.team).toLowerCase().includes(q))),
  );
  const toggle = (pid: string) => setSelected((s) => (s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]));

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {selected.map((pid) => (
        <input key={pid} type="hidden" name={name} value={pid} />
      ))}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((pid) => {
            const p = people.find((x) => x.id === pid)!;
            return (
              <span
                key={pid}
                className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 ps-2.5 pe-1 text-sm"
              >
                {p.name}
                <button
                  type="button"
                  onClick={() => toggle(pid)}
                  aria-label={t("Remove {name}", { name: p.name })}
                  className="rounded-full p-0.5 hover:bg-background"
                >
                  <X className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <Input
        id={id}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (matches.length === 1) {
              toggle(matches[0].id);
              setQuery("");
            }
          }
        }}
        placeholder={t("Search by name or email")}
        autoComplete="off"
      />
      <ul className="max-h-48 overflow-y-auto rounded-md border text-sm">
        {matches.length === 0 ? (
          <li className="px-3 py-2 text-muted-foreground">{t("No one matches.")}</li>
        ) : (
          matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  toggle(p.id);
                  setQuery("");
                }}
                className="flex w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-1.5 text-start hover:bg-muted"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {p.team && `${t(p.team)} · `}
                  <span dir="ltr">{p.email}</span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
