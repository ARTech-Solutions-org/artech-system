import { ar } from "./ar";

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "lang";

/** UI text is written in English; every key must have an Arabic entry in `ar.ts`. */
export type Msg = keyof typeof ar;
export type Vars = Record<string, string | number>;
export type T = (key: Msg, vars?: Vars) => string;

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);
export const dirOf = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");

export function makeT(locale: Locale): T {
  return (key, vars) => {
    const text: string = locale === "ar" ? ar[key] : key;
    return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => String(vars[name] ?? m)) : text;
  };
}

/** For messages that arrive as plain strings (e.g. validation errors); unknown text is shown as is. */
export function translateLoose(locale: Locale, text: string, vars?: Vars): string {
  return text in ar ? makeT(locale)(text as Msg, vars) : text;
}

/** Validation messages in schemas are written as dictionary keys. */
export const firstIssue = (error: { issues: { message: string }[] }) => error.issues[0].message as Msg;

// Latin digits in Arabic keep dates and amounts consistent with what people type.
const intlLocale = (locale: Locale) => (locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB");

export function makeFormatters(locale: Locale) {
  const loc = intlLocale(locale);
  return {
    /** Formats a `YYYY-MM-DD` date column without shifting it by timezone. */
    date(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
      if (!d) return "—";
      return new Date(`${d}T00:00:00Z`).toLocaleDateString(loc, {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        year: "numeric",
        ...opts,
      });
    },
    dateTime(d: Date | null | undefined) {
      if (!d) return "—";
      return d.toLocaleString(loc, { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" });
    },
    money(amount: string | number | null | undefined, currency: string) {
      if (amount === null || amount === undefined || amount === "") return "—";
      return new Intl.NumberFormat(locale === "ar" ? loc : "en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(Number(amount));
    },
    monthYear(year: number, month: number) {
      return new Date(Date.UTC(year, month, 1)).toLocaleDateString(loc, { timeZone: "UTC", month: "long", year: "numeric" });
    },
    weekday(d: Date, style: "short" | "long" = "short") {
      return d.toLocaleDateString(loc, { timeZone: "UTC", weekday: style });
    },
  };
}
export type Formatters = ReturnType<typeof makeFormatters>;
