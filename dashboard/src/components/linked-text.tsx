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
              <a
                key={j}
                href={part}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-4"
              >
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

/** Shows the text in the viewer's language, with the other language one click away. */
export function BilingualText({
  en,
  ar,
  locale,
  empty,
  showOther,
}: {
  en: string | null | undefined;
  ar: string | null | undefined;
  locale: "en" | "ar";
  empty?: string;
  showOther: string;
}) {
  const [main, other] = locale === "ar" ? [ar || en, ar ? en : null] : [en || ar, en ? ar : null];
  return (
    <div className="flex flex-col gap-2">
      <LinkedText text={main} empty={empty} />
      {other?.trim() && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">{showOther}</summary>
          <div className="mt-2 border-s-2 ps-3">
            <LinkedText text={other} />
          </div>
        </details>
      )}
    </div>
  );
}
