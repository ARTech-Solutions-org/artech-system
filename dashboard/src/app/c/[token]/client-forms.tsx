"use client";

import { Check } from "lucide-react";
import { useActionState, useRef, useState, useSyncExternalStore } from "react";
import type { FormState } from "@/app/actions/auth";
import { replyToItem, submitClientFeedback } from "@/app/actions/client-feedback";
import { DictateButton } from "@/components/dictate-button";
import { FormMessage } from "@/components/form-message";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const NAME_KEY = "artech_client_name";

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The client's name, remembered on this device so they type it once. */
function useClientName() {
  const name = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(NAME_KEY) ?? "",
    () => "",
  );
  const save = (value: string) => {
    localStorage.setItem(NAME_KEY, value);
    listeners.forEach((l) => l());
  };
  return [name, save] as const;
}

export function ClientFeedbackForm({ token }: { token: string }) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const res = await submitClientFeedback(prev, formData);
    if (res?.success) setBody("");
    return res;
  }, undefined);
  const [name, setName] = useClientName();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-name">{t("Your name")}</Label>
        <Input
          id="client-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="client-body">{t("Your comments")}</Label>
          <DictateButton target={bodyRef} />
        </div>
        <Textarea
          ref={bodyRef}
          id="client-body"
          name="body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          maxLength={4000}
          placeholder={t("Write each change you need. Links to files or references are welcome.")}
        />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t("Sending…") : t("Send comments")}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function ClientReplyForm({ token, itemId }: { token: string; itemId: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(replyToItem, undefined);
  const [name, setName] = useClientName();
  const [changes, setChanges] = useState(false);
  const [typingName, setTypingName] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-2 border-t pt-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="itemId" value={itemId} />
      {!name || typingName ? (
        <Input
          name="name"
          value={name}
          onChange={(e) => {
            setTypingName(true);
            setName(e.target.value);
          }}
          placeholder={t("Your name")}
          required
          maxLength={100}
          className="max-w-64"
        />
      ) : (
        <input type="hidden" name="name" value={name} />
      )}
      {changes && (
        <Textarea
          name="comment"
          rows={2}
          required
          maxLength={2000}
          placeholder={t("What still needs to change?")}
          autoFocus
        />
      )}
      <div className="flex flex-wrap gap-2">
        {changes ? (
          <>
            <Button type="submit" name="approve" value="no" size="sm" disabled={pending}>
              {t("Send")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setChanges(false)}>
              {t("Cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" name="approve" value="yes" size="sm" disabled={pending}>
              <Check />
              {t("Approve")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setChanges(true)}>
              {t("Still needs changes")}
            </Button>
          </>
        )}
      </div>
      <FormMessage state={state} />
    </form>
  );
}
