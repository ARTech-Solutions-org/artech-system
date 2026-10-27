"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { runDaily, runMonthly, runWeekly } from "@/lib/automations";
import { sendEmails } from "@/lib/mail";
import { getLocale } from "@/lib/i18n/server";
import type { FormState } from "./auth";

export async function runAutomation(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  if (!me.isSuperAdmin) return { error: "Only the super admin can run automations." };
  const job = z.enum(["daily", "weekly", "monthly", "test"]).safeParse(formData.get("job"));
  if (!job.success) return { error: "Unknown job." };

  let result: { sent: number; failed: number };
  if (job.data === "test") {
    if (!me.email.includes("@")) {
      return { error: "Your login has no email address. Set a real email for your user on the Users page first." };
    }
    result = await sendEmails([
      {
        event: "test",
        recipient: { id: me.id, name: me.name, email: me.email, locale: await getLocale() },
        content: (t) => ({
          subject: t("Studio OS test email"),
          lines: [t("If you can read this, email notifications are working.")],
          link: { label: t("Open dashboard"), path: "/automations" },
        }),
      },
    ]);
  } else if (job.data === "monthly") {
    result = await runMonthly("current");
  } else {
    result = await (job.data === "daily" ? runDaily() : runWeekly());
  }

  await audit({
    userId: me.id,
    action: `automation_${job.data}`,
    entity: "automation",
    entityId: job.data,
    changes: result,
  });
  revalidatePath("/automations");
  return result.failed
    ? { error: "{failed} email(s) failed. See the email log below.", vars: { failed: result.failed } }
    : { success: "Done: {sent} email(s) sent.", vars: { sent: result.sent } };
}
