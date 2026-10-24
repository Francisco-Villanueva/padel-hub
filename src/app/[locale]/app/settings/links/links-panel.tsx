"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { rotateLinkAction, setLinkActiveAction, type SettingsState } from "../actions";

export type LinkInfo = { kind: "link" | "tablet"; url: string; active: boolean };
const idle = { status: "idle" } as SettingsState;

/** Interruptor que envía el formulario al cambiar. Si falla, el estado vuelve al guardado en el servidor. */
function ActiveSwitch({ kind, active, label }: { kind: LinkInfo["kind"]; active: boolean; label: string }) {
  const locale = useLocale();
  const t = useTranslations("settings.links");
  const [, action, pending] = useActionState(setLinkActiveAction, idle);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="active" value={String(!active)} />
      <span className="text-sm font-semibold">{active ? t("enabled") : ""}</span>
      <button
        type="submit" role="switch" aria-checked={active} aria-label={label} disabled={pending}
        className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60", active ? "bg-brand" : "bg-line-strong")}
      >
        <span aria-hidden className={cx("absolute left-1 top-1 size-5 rounded-full bg-surface-raised shadow transition-transform", active && "translate-x-5")} />
      </button>
    </form>
  );
}

function RotateButton({ kind }: { kind: LinkInfo["kind"] }) {
  const t = useTranslations("settings.links.rotate");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: SettingsState, fd: FormData) => {
    const res = await rotateLinkAction(prev, fd);
    if (res.status === "ok") setOpen(false);
    return res;
  }, idle);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(ui.btn, ui.btnSecondary, "shrink-0")}>{t("cta")}</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("confirmTitle")}
        description={t("confirmBody")}
        actions={
          <>
            <button type="button" onClick={() => setOpen(false)} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>
            <form action={action} className="contents">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="kind" value={kind} />
              <button type="submit" disabled={pending} className={cx(ui.btn, ui.btnPrimary)}>{t("cta")}</button>
            </form>
          </>
        }
      >
        {state.status === "error" && <p role="alert" className={ui.error}>{state.error}</p>}
      </Modal>
    </>
  );
}

function LinkCard({ info, title, hint, label, children }: { info: LinkInfo; title: string; hint: string; label: string; children?: React.ReactNode }) {
  const t = useTranslations("settings.links");
  const id = `link-${info.kind}`;
  return (
    <section className={cx(ui.card, "enter space-y-4")}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        <ActiveSwitch kind={info.kind} active={info.active} label={t("switchFor", { name: title })} />
      </div>
      <p className="text-sm text-ink-muted">{hint}</p>
      <div>
        <label htmlFor={id} className={ui.label}>{label}</label>
        <input id={id} readOnly value={info.url} className={cx(ui.input, "truncate", !info.active && "opacity-60")} />
        {!info.active && <p className={cx(ui.hint, "font-semibold")}>{t("disabledNote")}</p>}
      </div>
      {children}
      <div className="flex flex-wrap gap-2">
        <CopyButton value={info.url} />
      </div>
    </section>
  );
}

export function LinksPanel({ link, tablet }: { link: LinkInfo; tablet: LinkInfo }) {
  const t = useTranslations("settings.links");
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <LinkCard info={link} title={t("public.title")} hint={t("public.hint")} label={t("public.label")}>
          <p className="text-sm text-ink-muted">{t("public.langHint")}</p>
        </LinkCard>
        <LinkCard info={tablet} title={t("tablet.title")} hint={t("tablet.hint")} label={t("tablet.label")}>
          <p className="text-sm text-ink-muted">{t("tablet.fixedHint")}</p>
          <a href={tablet.url} target="_blank" rel="noopener noreferrer" className={cx(ui.btn, ui.btnPrimary, "w-full sm:w-auto")}>{t("tablet.open")}</a>
        </LinkCard>
      </div>
      <div role="note" className={cx(ui.notice, ui.noticeWarning, "flex flex-wrap items-center justify-between gap-3 border border-warning")}>
        <div className="flex items-start gap-3">
          <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
          <div>
            <p className="font-semibold">{t("rotate.title")}</p>
            <p className="font-normal">{t("rotate.body")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <RotateLabeled kind="link" label={t("public.title")} />
          <RotateLabeled kind="tablet" label={t("tablet.title")} />
        </div>
      </div>
    </div>
  );
}

function RotateLabeled({ kind, label }: { kind: LinkInfo["kind"]; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm font-semibold sm:inline">{label}</span>
      <RotateButton kind={kind} />
    </div>
  );
}
