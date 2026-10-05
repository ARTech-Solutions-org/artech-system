"use client";

import { createContext, useContext, useMemo } from "react";
import { type Locale, makeFormatters, makeT, translateLoose, type Vars } from "@/lib/i18n";

const LocaleContext = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const locale = useContext(LocaleContext);
  return useMemo(
    () => ({
      locale,
      t: makeT(locale),
      tLoose: (text: string, vars?: Vars) => translateLoose(locale, text, vars),
      fmt: makeFormatters(locale),
    }),
    [locale],
  );
}
