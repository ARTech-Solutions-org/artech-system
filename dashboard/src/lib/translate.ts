import "server-only";
import type { Locale } from "@/lib/i18n";

const MAX_CHARS = 5000;

export const hasArabic = (text: string) => /[\u0600-\u06FF]/.test(text);

/** Google Cloud Translation when GOOGLE_TRANSLATE_API_KEY is set, otherwise Google's free web endpoint. */
export async function translate(text: string, to: Locale): Promise<string> {
  const q = text.slice(0, MAX_CHARS);
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  const signal = AbortSignal.timeout(10_000);

  if (key) {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q, target: to, format: "text" }),
      signal,
    });
    if (!res.ok) throw new Error(`Translation failed (${res.status})`);
    const json = (await res.json()) as { data: { translations: { translatedText: string }[] } };
    return json.data.translations[0].translatedText;
  }

  const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ q }),
    signal,
  });
  if (!res.ok) throw new Error(`Translation failed (${res.status})`);
  const json = (await res.json()) as [[string, string][]];
  return json[0].map((segment) => segment[0]).join("");
}
