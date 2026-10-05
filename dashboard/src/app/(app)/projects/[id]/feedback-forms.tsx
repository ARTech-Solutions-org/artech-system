"use client";

import { Check, Copy, Plus, Sparkles, X } from "lucide-react";
import { useActionState, useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { FormState } from "@/app/actions/auth";
import {
  addFeedbackComment,
  changeFeedback,
  type FeedbackChange,
  logFeedback,
  setClientLink,
  splitClientMessage,
} from "@/app/actions/feedback";
import { DictateButton } from "@/components/dictate-button";
import { Field, Submit, useForm } from "@/components/form-fields";
import { FormMessage, selectClass } from "@/components/form-message";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FEEDBACK_SOURCE_LABELS, FEEDBACK_TYPE_LABELS } from "@/lib/format";

type Person = { id: string; name: string };
type ItemType = keyof typeof FEEDBACK_TYPE_LABELS;
type Row = { key: number; body: string; type: ItemType; priority: "normal" | "urgent" };

const SOURCES = ["whatsapp", "call", "email", "meeting", "site_visit"] as const;
let nextKey = 1;
const emptyRow = (): Row => ({ key: nextKey++, body: "", type: "general", priority: "normal" });

export function LogFeedbackForm({
  projectId,
  assignees,
  ai,
  today,
  hasRounds,
}: {
  projectId: string;
  assignees: Person[];
  ai: boolean;
  today: string;
  hasRounds: boolean;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [message, setMessage] = useState("");
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const res = await logFeedback(prev, formData);
    if (res?.success) {
      setRows([emptyRow()]);
      setMessage("");
    }
    return res;
  }, undefined);
  const [splitError, setSplitError] = useState<FormState>(undefined);
  const [splitting, startSplit] = useTransition();
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const split = () =>
    startSplit(async () => {
      setSplitError(undefined);
      const res = await splitClientMessage(projectId, messageRef.current?.value ?? message);
      if (res.error) return setSplitError({ error: res.error });
      const found = res.items!.map((i) => ({
        key: nextKey++,
        body: i.body,
        type: i.type,
        priority: i.urgent ? ("urgent" as const) : ("normal" as const),
      }));
      setRows((list) => [...list.filter((r) => r.body.trim()), ...found]);
    });

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />

      {ai && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-1.5">
              <Sparkles className="size-4" />
              {t("Quick capture")}
            </Label>
            <DictateButton target={messageRef} />
          </div>
          <Textarea
            ref={messageRef}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t(
              "Paste the client's WhatsApp message or meeting notes. It will be split into separate items.",
            )}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={split} disabled={splitting || !message.trim()}>
              <Sparkles />
              {splitting ? t("Splitting…") : t("Split into items")}
            </Button>
            <FormMessage state={splitError} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <div key={r.key} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label>{t("Item {n}", { n: i + 1 })}</Label>
              {rows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("Remove")}
                  onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                >
                  <X />
                </Button>
              )}
            </div>
            <Textarea
              name="body"
              rows={2}
              value={r.body}
              onChange={(e) => update(r.key, { body: e.target.value })}
              placeholder={t("What did the client ask for?")}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                name="type"
                value={r.type}
                onChange={(e) => update(r.key, { type: e.target.value as ItemType })}
                className={selectClass}
                aria-label={t("Type")}
              >
                {Object.entries(FEEDBACK_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(label)}
                  </option>
                ))}
              </select>
              <select
                name="priority"
                value={r.priority}
                onChange={(e) => update(r.key, { priority: e.target.value as Row["priority"] })}
                className={selectClass}
                aria-label={t("Priority")}
              >
                <option value="normal">{t("Normal")}</option>
                <option value="urgent">{t("Urgent")}</option>
              </select>
            </div>
            {r.type === "new_request" && (
              <p className="text-xs text-muted-foreground">
                {t("Business will decide if this is included or costs extra before anyone works on it.")}
              </p>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setRows((l) => [...l, emptyRow()])}
        >
          <Plus />
          {t("Add another item")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fb-source">{t("Came from")}</Label>
          <select id="fb-source" name="source" defaultValue="whatsapp" className={selectClass}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(FEEDBACK_SOURCE_LABELS[s])}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fb-date">{t("Received on")}</Label>
          <Input id="fb-date" type="date" name="receivedOn" defaultValue={today} max={today} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fb-assignee">{t("Assign to")}</Label>
          <select id="fb-assignee" name="assigneeId" defaultValue="" className={selectClass}>
            <option value="">{t("Nobody yet")}</option>
            {assignees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {hasRounds && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="newRound" className="mt-1" />
          <span>
            {t("Start a new revision round")}
            <span className="block text-xs text-muted-foreground">
              {t("Tick this when the client reviewed the last delivery and sent a new batch of comments.")}
            </span>
          </span>
        </label>
      )}

      <Submit pending={pending} label={t("Save feedback")} pendingLabel={t("Saving…")} />
      <FormMessage state={state} />
    </form>
  );
}

export type ItemPermissions = {
  start: boolean;
  done: boolean;
  reopen: boolean;
  approve: boolean;
  reject: boolean;
  scope: boolean;
  requestDeadline: boolean;
  decideDeadline: boolean;
  assign: boolean;
  selfAssign: boolean;
};

export function FeedbackItemActions({
  itemId,
  can,
  assignees,
  assigneeId,
  meId,
  extraDays,
}: {
  itemId: string;
  can: ItemPermissions;
  assignees: Person[];
  assigneeId: string | null;
  meId: string;
  extraDays: number | null;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<FormState>(undefined);
  const [pending, start] = useTransition();
  const [panel, setPanel] = useState<"reject" | "deadline" | null>(null);
  const [note, setNote] = useState("");
  const [days, setDays] = useState("2");

  const run = (change: FeedbackChange, after?: () => void) =>
    start(async () => {
      const res = await changeFeedback(itemId, change);
      setState(res);
      if (res?.success) {
        setPanel(null);
        setNote("");
        after?.();
      }
    });

  return (
    <div className="flex flex-col gap-2">
      {can.scope && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <Label>{t("Is this part of the project?")}</Label>
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("Note for the team, e.g. the extra cost agreed with the client")}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => run({ kind: "scope", decision: "included", note })}>
              {t("Included")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run({ kind: "scope", decision: "extra_cost", note })}
            >
              {t("Extra cost")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => run({ kind: "scope", decision: "rejected", note })}
            >
              {t("Not doing it")}
            </Button>
          </div>
        </div>
      )}

      {can.decideDeadline && extraDays && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <span className="me-auto">{t("Add {days} day(s) to the dev deadline?", { days: extraDays })}</span>
          <Button size="sm" disabled={pending} onClick={() => run({ kind: "deadline_decide", apply: true })}>
            {t("Apply")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run({ kind: "deadline_decide", apply: false })}
          >
            {t("Decline")}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {can.assign ? (
          <select
            value={assigneeId ?? ""}
            disabled={pending}
            onChange={(e) => run({ kind: "assign", assigneeId: e.target.value || null })}
            className={`${selectClass} h-7 w-auto max-w-48`}
            aria-label={t("Assign to")}
          >
            <option value="">{t("Unassigned")}</option>
            {assignees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          can.selfAssign &&
          assigneeId !== meId && (
            <Button
              size="xs"
              variant="outline"
              disabled={pending}
              onClick={() => run({ kind: "assign", assigneeId: meId })}
            >
              {t("Take it")}
            </Button>
          )
        )}
        {can.start && (
          <Button size="xs" variant="outline" disabled={pending} onClick={() => run({ kind: "start" })}>
            {t("Start")}
          </Button>
        )}
        {can.done && (
          <Button size="xs" disabled={pending} onClick={() => run({ kind: "done" })}>
            <Check />
            {t("Mark done")}
          </Button>
        )}
        {can.approve && (
          <Button size="xs" disabled={pending} onClick={() => run({ kind: "approve" })}>
            <Check />
            {t("Client approved")}
          </Button>
        )}
        {can.reopen && (
          <Button size="xs" variant="outline" disabled={pending} onClick={() => run({ kind: "reopen" })}>
            {t("Reopen")}
          </Button>
        )}
        {can.requestDeadline && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setPanel(panel === "deadline" ? null : "deadline")}
            aria-expanded={panel === "deadline"}
          >
            {t("Needs more time")}
          </Button>
        )}
        {can.reject && (
          <Button
            size="xs"
            variant="ghost"
            className="text-destructive"
            onClick={() => setPanel(panel === "reject" ? null : "reject")}
            aria-expanded={panel === "reject"}
          >
            {t("Not doing it")}
          </Button>
        )}
      </div>

      {panel === "deadline" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex w-24 flex-col gap-1.5">
            <Label htmlFor={`days-${itemId}`}>{t("Extra days")}</Label>
            <Input
              id={`days-${itemId}`}
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <Label htmlFor={`dnote-${itemId}`}>{t("Why?")}</Label>
            <Input id={`dnote-${itemId}`} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run({ kind: "deadline_request", days: Number(days), note })}
          >
            {t("Ask the Tech Head")}
          </Button>
        </div>
      )}

      {panel === "reject" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <Label htmlFor={`reason-${itemId}`}>{t("Reason (optional)")}</Label>
            <Input id={`reason-${itemId}`} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => run({ kind: "reject", reason: note })}
          >
            {t("Confirm")}
          </Button>
        </div>
      )}

      <FormMessage state={state} />
    </div>
  );
}

export function FeedbackCommentForm({ itemId }: { itemId: string }) {
  const { t } = useI18n();
  const f = useForm(addFeedbackComment);
  return (
    <form key={f.key} action={f.formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <Field
        label={t("Add a comment")}
        name="body"
        values={f.values}
        required
        voice={false}
        placeholder={t("Question, update or file link")}
        className="min-w-56 flex-1"
      />
      <Submit pending={f.pending} label={t("Send")} pendingLabel={t("Sending…")} variant="outline" />
      <div className="basis-full">
        <FormMessage state={f.state} />
      </div>
    </form>
  );
}

export function ClientLinkControls({ projectId, token }: { projectId: string; token: string | null }) {
  const { t } = useI18n();
  const [state, setState] = useState<FormState>(undefined);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const url = token ? `${origin}/c/${token}` : "";

  const toggle = (on: boolean) => start(async () => setState(await setClientLink(projectId, on)));
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-2">
      {token ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              readOnly
              value={url}
              className="min-w-64 flex-1 font-mono text-xs"
              onFocus={(e) => e.target.select()}
            />
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? t("Copied") : t("Copy")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="ghost" disabled={pending} onClick={() => toggle(true)}>
              {t("Make a new link")}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="text-destructive"
              disabled={pending}
              onClick={() => toggle(false)}
            >
              {t("Turn off")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "Anyone with this link can see this project's feedback items and add comments. Making a new link stops the old one.",
            )}
          </p>
        </>
      ) : (
        <Button size="sm" variant="outline" className="self-start" disabled={pending} onClick={() => toggle(true)}>
          {t("Create client link")}
        </Button>
      )}
      <FormMessage state={state} />
    </div>
  );
}
