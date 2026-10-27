"use client";

import { runAutomation } from "@/app/actions/automations";
import { Submit, useForm } from "@/components/form-fields";
import { FormMessage } from "@/components/form-message";
import { useI18n } from "@/components/i18n-provider";
import type { Msg } from "@/lib/i18n";

const JOBS: { job: string; label: Msg }[] = [
  { job: "test", label: "Send me a test email" },
  { job: "daily", label: "Run daily reminders now" },
  { job: "weekly", label: "Send weekly summary now" },
  { job: "monthly", label: "Send this month's completed-projects report" },
];

export function RunButtons() {
  const { t } = useI18n();
  const f = useForm(runAutomation);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {JOBS.map((j) => (
          <form key={j.job} action={f.formAction}>
            <input type="hidden" name="job" value={j.job} />
            <Submit pending={f.pending} label={t(j.label)} pendingLabel={t("Running…")} variant="outline" />
          </form>
        ))}
      </div>
      <FormMessage state={f.state} />
    </div>
  );
}
