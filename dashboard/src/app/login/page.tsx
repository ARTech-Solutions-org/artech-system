import { redirect } from "next/navigation";
import { LanguageSwitch } from "@/components/language-switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const { t } = await getI18n();

  return (
    <main className="flex flex-1 bg-brand-black">
      <div className="hidden flex-1 flex-col justify-between p-10 lg:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/artech-wordmark-white.png" alt="ARTECH" className="h-5 w-auto" />
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/artech-logo-white.png" alt="ARTECH, Live the experience" className="w-80 max-w-full" />
        </div>
        <p className="font-heading text-[11px] font-semibold tracking-[0.32em] text-white/40 uppercase">{t("Studio")}</p>
      </div>
      <div className="flex w-full flex-col items-center justify-center gap-8 bg-background p-6 lg:w-[28rem] lg:shrink-0">
        <div className="flex flex-col items-center gap-4 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/artech-logo-white.png" alt="ARTECH, Live the experience" className="w-52 max-w-full" />
        </div>
        <Card className="w-full max-w-sm ring-0 lg:max-w-none">
          <CardHeader>
            <CardTitle className="font-heading text-3xl font-bold">{t("Sign in")}</CardTitle>
            <CardDescription>{t("Sign in with the account your department head created for you.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
        <LanguageSwitch />
      </div>
    </main>
  );
}
