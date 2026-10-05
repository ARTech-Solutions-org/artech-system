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
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-brand-black p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/artech-logo-white.png" alt="ARTECH, Live the experience" className="w-64 max-w-full" />
      <Card className="w-full max-w-sm border-t-4 border-t-brand-purple">
        <CardHeader>
          <CardTitle className="text-xl">{t("Sign in")}</CardTitle>
          <CardDescription>{t("Sign in with the account your department head created for you.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
      <LanguageSwitch className="[&_button]:text-white/70 [&_button]:hover:bg-white/10 [&_button]:hover:text-white" />
    </main>
  );
}
