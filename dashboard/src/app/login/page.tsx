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
    <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Studio OS</CardTitle>
          <CardDescription>{t("Sign in with the account your department head created for you.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
      <LanguageSwitch />
    </main>
  );
}
