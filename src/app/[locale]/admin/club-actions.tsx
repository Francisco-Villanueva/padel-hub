"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Modal } from "@/components/modal";
import { NewPasswordFields } from "@/components/password-input";
import { cx, ui } from "@/components/ui";
import { resetOwnerPasswordAction, setClubFeatureAction, setClubStatusAction, type AdminState } from "./actions";

const idle = { status: "idle" } as AdminState;

/** Suspender o reactivar un club, siempre con confirmación (la suspensión corta el acceso de sus usuarios). */
export function ClubStatusButton({ clubId, clubName, suspended, small, className }: { clubId: string; clubName: string; suspended: boolean; small?: boolean; className?: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: AdminState, fd: FormData) => {
    const res = await setClubStatusAction(prev, fd);
    if (res.status === "ok") setOpen(false);
    return res;
  }, idle);
  const label = suspended ? t("clubs.reactivate") : t("clubs.suspend");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(small ? ui.btnSm : ui.btn, ui.btnSecondary, className)} aria-label={`${label}: ${clubName}`}>{label}</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={suspended ? t("detail.reactivateTitle") : t("detail.suspendTitle")}
        description={suspended ? t("detail.reactivateBody", { name: clubName }) : t("detail.suspendBody", { name: clubName })}
        actions={
          <>
            <button type="button" onClick={() => setOpen(false)} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>
            <form action={action} className="contents">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="clubId" value={clubId} />
              <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
              <button type="submit" disabled={pending} className={cx(ui.btn, suspended ? ui.btnPrimary : ui.btnDangerSolid)}>{label}</button>
            </form>
          </>
        }
      >
        {state.status === "error" && <p role="alert" className={ui.error}>{t("detail.errors.generic")}</p>}
      </Modal>
    </>
  );
}

export function OwnerPasswordButton({ clubId, ownerId, ownerName }: { clubId: string; ownerId: string; ownerName: string }) {
  const t = useTranslations("admin.detail");
  const ts = useTranslations("settings.users");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: AdminState, fd: FormData) => {
    const res = await resetOwnerPasswordAction(prev, fd);
    if (res.status === "ok") setOpen(false);
    return res;
  }, idle);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(ui.btn, ui.btnSecondary, "w-full")}>{t("owner.resetPassword")}</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={ts("passwordTitle", { name: ownerName })}
        description={ts("passwordBody")}
        actions={
          <>
            <button type="button" onClick={() => setOpen(false)} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>
            <button type="submit" form="owner-pw" disabled={pending} className={cx(ui.btn, ui.btnPrimary)}>{ts("password")}</button>
          </>
        }
      >
        <form id="owner-pw" action={action} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clubId" value={clubId} />
          <input type="hidden" name="userId" value={ownerId} />
          <NewPasswordFields id="owner-new-password" name="password" label={ts("newPassword")} describedBy="owner-pw-error" />
          {state.status === "error" && (
            <p id="owner-pw-error" role="alert" className={ui.error}>{state.error === "validation" ? ts("errors.password_short") : t("errors.generic")}</p>
          )}
        </form>
      </Modal>
    </>
  );
}

/** Interruptor de una función del club (torneos…). Apagar pide confirmación; no borra datos. */
export function FeatureToggle({ clubId, feature, enabled, enabledAt }: { clubId: string; feature: "tournaments"; enabled: boolean; enabledAt?: string }) {
  const t = useTranslations("admin.detail.features");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: AdminState, fd: FormData) => {
    const res = await setClubFeatureAction(prev, fd);
    if (res.status === "ok") setOpen(false);
    return res;
  }, idle);
  const form = (next: boolean) => (
    <form action={action} className="contents">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="feature" value={feature} />
      <input type="hidden" name="enabled" value={String(next)} />
      <button type="submit" disabled={pending} className={cx(ui.btn, next ? ui.btnPrimary : ui.btnDangerSolid)}>{next ? t("on") : t("off")}</button>
    </form>
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold">{t(`${feature}.name`)}</p>
        <p className="text-sm text-ink-muted">{t(`${feature}.desc`)}</p>
        {enabled && enabledAt && <p className="mt-1 text-xs text-ink-muted">{t("enabledAt", { date: enabledAt })}</p>}
        {state.status === "error" && <p role="alert" className={ui.error}>{t("errors.generic")}</p>}
      </div>
      {enabled ? (
        <>
          <button type="button" onClick={() => setOpen(true)} className={cx(ui.btn, ui.btnSecondary)} aria-pressed="true">{t("enabled")}</button>
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title={t("offTitle")}
            description={t("offBody")}
            actions={<><button type="button" onClick={() => setOpen(false)} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>{form(false)}</>}
          />
        </>
      ) : (
        form(true)
      )}
    </div>
  );
}
