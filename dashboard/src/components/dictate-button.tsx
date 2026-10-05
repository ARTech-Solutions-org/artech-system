"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n-provider";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult:
    ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const LANGS = { en: "en-US", ar: "ar-EG" } as const;
type Lang = keyof typeof LANGS;

/** Speech-to-text into an uncontrolled input/textarea. Hidden in browsers without speech recognition (Firefox). */
export function DictateButton({ target }: { target: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null> }) {
  const { t, locale } = useI18n();
  const supported = useSyncExternalStore(
    () => () => {},
    () => !!recognitionCtor(),
    () => false,
  );
  const [lang, setLang] = useState<Lang>(locale === "ar" ? "ar" : "en");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => () => rec.current?.stop(), []);

  if (!supported) return null;

  function start() {
    const el = target.current;
    const Ctor = recognitionCtor();
    if (!el || !Ctor) return;
    setError(null);
    const r = new Ctor();
    r.lang = LANGS[lang];
    r.continuous = true;
    r.interimResults = true;
    // Text before dictation started; finished phrases are appended to it, the phrase in progress is shown after it.
    let base = el.value;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const said = e.results[i][0].transcript.trim();
        if (!said) continue;
        if (e.results[i].isFinal) base = join(base, said);
        else interim = join(interim, said);
      }
      el.value = join(base, interim);
      el.scrollTop = el.scrollHeight;
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        setError(t("Allow microphone access to dictate."));
      else if (e.error !== "no-speech" && e.error !== "aborted") setError(t("Dictation stopped. Try again."));
    };
    r.onend = () => {
      el.value = base;
      setListening(false);
      rec.current = null;
    };
    rec.current = r;
    r.start();
    setListening(true);
    el.focus();
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setLang(lang === "en" ? "ar" : "en")}
        disabled={listening}
        title={t("Dictation language")}
        className="rounded border px-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        {lang === "en" ? "EN" : "ع"}
      </button>
      <button
        type="button"
        onClick={() => (listening ? rec.current?.stop() : start())}
        title={listening ? t("Stop dictation") : t("Dictate")}
        aria-label={listening ? t("Stop dictation") : t("Dictate")}
        className={`inline-flex size-6 items-center justify-center rounded-full ${
          listening ? "animate-pulse bg-red-600 text-white" : "text-muted-foreground hover:bg-muted"
        }`}
      >
        {listening ? <Square className="size-3" /> : <Mic className="size-3.5" />}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

function join(a: string, b: string) {
  if (!b) return a;
  if (!a) return b;
  return /\s$/.test(a) ? a + b : `${a} ${b}`;
}
