import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { dirOf, isLocale, LOCALE_COOKIE, type Locale, makeFormatters, makeT } from ".";

export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "en";
});

export const getI18n = cache(async () => {
  const locale = await getLocale();
  return { locale, dir: dirOf(locale), t: makeT(locale), fmt: makeFormatters(locale) };
});
