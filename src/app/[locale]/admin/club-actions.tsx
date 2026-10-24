"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { resendOwnerInviteAction, resetOwnerPasswordAction, setClubStatusAction, type AdminState } from "./actions";

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

/** Reenviar la invitación al dueño que todavía no activó su cuenta. */
export function OwnerResendButton({ clubId, ownerId, ownerName, ownerEmail }: { clubId: string; ownerId: string; ownerName: string; ownerEmail: string }) {
  const t = useTranslations("admin.detail");
  const ts = useTranslations("settings.users");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: AdminState, fd: FormData) => {
    const res = await resendOwnerInviteAction(prev, fd);
    if (res.status === "ok") setOpen(false);
    return res;
  }, idle);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(ui.btn, ui.btnPrimary, "w-full")} aria-label={`${ts("resend")}: ${ownerName}`}>{ts("resend")}</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={ts("resendTitle")}
        description={ts("resendBody", { name: ownerName, email: ownerEmail })}
        actions={
          <>
            <button type="button" onClick={() => setOpen(false)} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>
            <button type="submit" form="owner-resend" disabled={pending} className={cx(ui.btn, ui.btnPrimary)}>{pending ? ts("inviting") : ts("resend")}</button>
          </>
        }
      >
        <form id="owner-resend" action={action} className="space-y-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clubId" value={clubId} />
          <input type="hidden" name="userId" value={ownerId} />
          {state.status === "error" && (
            <p role="alert" className={ui.error}>{state.error && ["email_failed", "not_pending", "rate_limited", "email_disabled"].includes(state.error) ? ts(`errors.${state.error}`) : t("errors.generic")}</p>
          )}
        </form>
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
        <form id="owner-pw" action={action} className="space-y-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clubId" value={clubId} />
          <input type="hidden" name="userId" value={ownerId} />
          <label htmlFor="owner-new-password" className={ui.label}>{ts("newPassword")}</label>
          <input id="owner-new-password" name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" className={ui.input} aria-describedby="owner-pw-error" />
          {state.status === "error" && (
            <p id="owner-pw-error" role="alert" className={ui.error}>{state.error === "validation" ? ts("errors.password_short") : t("errors.generic")}</p>
          )}
        </form>
      </Modal>
    </>
  );
}
