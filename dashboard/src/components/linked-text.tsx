const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

/** Shows multi-line text, turning URLs into links that open in a new tab. */
export function LinkedText({ text, empty = "—" }: { text: string | null | undefined; empty?: string }) {
  if (!text?.trim()) return <p className="text-sm text-muted-foreground">{empty}</p>;

  return (
    <div className="flex flex-col gap-1 text-sm">
      {text.split("\n").map((line, i) => (
        <p key={i} dir="auto" className="break-words whitespace-pre-wrap [text-align:match-parent]">
          {line.split(URL_PATTERN).map((part, j) =>
            /^https?:\/\//.test(part) ? (
              <a key={j} href={part} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
                {part}
              </a>
            ) : (
              part
            ),
          )}
        </p>
      ))}
    </div>
  );
}
