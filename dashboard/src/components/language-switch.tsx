import { setLocale } from "@/app/actions/locale";
import { Button } from "@/components/ui/button";
import { getLocale } from "@/lib/i18n/server";

export async function LanguageSwitch({ className }: { className?: string }) {
  const other = (await getLocale()) === "ar" ? "en" : "ar";
  return (
    <form action={setLocale} className={className}>
      <input type="hidden" name="locale" value={other} />
      <Button type="submit" variant="ghost" size="sm" className="w-full" lang={other}>
        {other === "ar" ? "العربية" : "English"}
      </Button>
    </form>
  );
}
