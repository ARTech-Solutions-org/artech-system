import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export function ProjectCard({
  href,
  name,
  client,
  note,
  statusLabel,
  statusVariant = "secondary",
  meta,
  badges,
}: {
  href: string;
  name: string;
  client?: string | null;
  note?: string | null;
  statusLabel: string;
  statusVariant?: "secondary" | "outline";
  meta?: { label: string; value: string }[];
  badges?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-2xl bg-card p-5 ring-1 ring-border transition-colors hover:ring-white/25"
    >
      <div className="flex items-start justify-between gap-2">
        <Badge variant={statusVariant}>{statusLabel}</Badge>
        {badges}
      </div>
      <div dir="auto" className="font-heading mt-4 text-lg leading-snug font-semibold tracking-tight">
        {name}
      </div>
      {client ? (
        <div dir="auto" className="mt-1 text-sm text-muted-foreground">
          {client}
        </div>
      ) : null}
      {note ? <div className="mt-1 text-sm text-muted-foreground">{note}</div> : null}
      {meta && meta.length > 0 && (
        <dl className="mt-auto grid gap-1.5 border-t border-border pt-4 text-sm">
          {meta.map((m) => (
            <div key={m.label} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{m.label}</dt>
              <dd className="max-w-[65%] truncate text-end text-foreground">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Link>
  );
}
