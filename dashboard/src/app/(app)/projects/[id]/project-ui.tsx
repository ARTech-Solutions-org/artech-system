import { Button } from "@/components/ui/button";

export function EditSection({ label, open, children }: { label: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium select-none">{label}</summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

export function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      {children}
    </div>
  );
}

/** A one-button form for server actions that don't need a result message. */
export function SmallAction({
  action,
  fields,
  label,
  variant = "ghost",
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  variant?: "ghost" | "destructive" | "outline";
}) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" size="xs" variant={variant}>
        {label}
      </Button>
    </form>
  );
}
