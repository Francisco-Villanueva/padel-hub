"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { addStaffAction, removeStaffAction, resetStaffPasswordAction, type SettingsState } from "../actions";

export type Member = { userId: string; name: string; email: string; role: "owner" | "staff" };
type Dialog = { type: "add" } | { type: "password"; user: Member } | { type: "remove"; user: Member } | null;
type Act = (prev: SettingsState, fd: FormData) => Promise<SettingsState>;

/** Ejecuta la acción y, si salió bien, cierra el diálogo. El estado del formulario se descarta al desmontarlo. */
function useDialogAction(action: Act, onDone: () => void) {
  return useActionState(async (prev: SettingsState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res.status === "ok") onDone();
    return res;
  }, { status: "idle" } as SettingsState);
}

function ErrorText({ state, id }: { state: SettingsState; id: string }) {
  const t = useTranslations("settings");
  if (state.status !== "error" || !state.error) return null;
  const known = ["email_taken", "password_short", "not_found", "not_staff", "validation", "generic", "forbidden"];
  return <p id={id} role="alert" className={ui.error}>{known.includes(state.error) ? t(`users.errors.${state.error}`) : t(`errors.${state.error}`)}</p>;
}

function AddForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations("settings.users");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [state, action, pending] = useDialogAction(addStaffAction, onClose);
  const bad = (f: string) => state.fields?.includes(f) || undefined;
  return (
    <Modal
      open
      onClose={onClose}
      title={t("addTitle")}
      actions={
        <>
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>
          <button type="submit" form="add-staff" disabled={pending} className={cx(ui.btn, ui.btnPrimary)}>{pending ? t("creating") : t("create")}</button>
        </>
      }
    >
      <form id="add-staff" action={action} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />
        <div>
          <label htmlFor="staff-name" className={ui.label}>{t("name")}</label>
          <input id="staff-name" name="name" required minLength={2} maxLength={80} defaultValue={state.values?.name} className={ui.input} aria-invalid={bad("name")} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="staff-email" className={ui.label}>{t("email")}</label>
          <input id="staff-email" name="email" type="email" required maxLength={254} defaultValue={state.values?.email} className={ui.input} aria-invalid={bad("email")} aria-describedby="staff-error" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="staff-password" className={ui.label}>{t("initialPassword")}</label>
          <input id="staff-password" name="password" type="password" required minLength={10} maxLength={200} className={ui.input} aria-invalid={bad("password")} aria-describedby="staff-error" autoComplete="new-password" />
          <p className={ui.hint}>{t("passwordHint")}</p>
        </div>
        <ErrorText state={state} id="staff-error" />
      </form>
    </Modal>
  );
}

function PasswordForm({ user, onClose }: { user: Member; onClose: () => void }) {
  const t = useTranslations("settings.users");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [state, action, pending] = useDialogAction(resetStaffPasswordAction, onClose);
  return (
    <Modal
      open
      onClose={onClose}
      title={t("passwordTitle", { name: user.name })}
      description={t("passwordBody")}
      actions={
        <>
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>
          <button type="submit" form="reset-pw" disabled={pending} className={cx(ui.btn, ui.btnPrimary)}>{t("password")}</button>
        </>
      }
    >
      <form id="reset-pw" action={action} className="space-y-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="userId" value={user.userId} />
        <label htmlFor="new-password" className={ui.label}>{t("newPassword")}</label>
        <input id="new-password" name="password" type="password" required minLength={10} maxLength={200} className={ui.input} autoComplete="new-password" aria-describedby="pw-error" />
        <ErrorText state={state} id="pw-error" />
      </form>
    </Modal>
  );
}

function RemoveForm({ user, onClose }: { user: Member; onClose: () => void }) {
  const t = useTranslations("settings.users");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [state, action, pending] = useDialogAction(removeStaffAction, onClose);
  return (
    <Modal
      open
      onClose={onClose}
      title={t("removeTitle")}
      description={t("removeBody", { name: user.name })}
      actions={
        <>
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>
          <button type="submit" form="remove-staff" disabled={pending} className={cx(ui.btn, ui.btnDangerSolid)}>{t("remove")}</button>
        </>
      }
    >
      <form id="remove-staff" action={action}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="userId" value={user.userId} />
        <ErrorText state={state} id="rm-error" />
      </form>
    </Modal>
  );
}

export function UsersPanel({ members }: { members: Member[] }) {
  const t = useTranslations("settings.users");
  const tr = useTranslations("auth.role");
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setDialog({ type: "add" })} className={cx(ui.btn, ui.btnPrimary, "w-full sm:w-auto")}>+ {t("add")}</button>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-raised">
        {members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={m.name} />
            <div className="min-w-0 flex-1 basis-48">
              <p className="truncate font-semibold">{m.name}</p>
              <p className="truncate text-sm text-ink-muted">{m.email}</p>
            </div>
            <span className={m.role === "owner" ? ui.badgeAccent : ui.badge}>{tr(m.role)}</span>
            <span className={ui.badgeAccent}>
              <svg aria-hidden viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
              {t("active")}
            </span>
            {m.role === "staff" && (
              <div className="flex gap-2">
                <button type="button" onClick={() => setDialog({ type: "password", user: m })} className={cx(ui.btnSm, ui.btnGhost)} aria-label={`${t("password")}: ${m.name}`}>{t("password")}</button>
                <button type="button" onClick={() => setDialog({ type: "remove", user: m })} className={cx(ui.btnSm, ui.btnDanger)} aria-label={`${t("remove")}: ${m.name}`}>{t("remove")}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {dialog?.type === "add" && <AddForm onClose={close} />}
      {dialog?.type === "password" && <PasswordForm user={dialog.user} onClose={close} />}
      {dialog?.type === "remove" && <RemoveForm user={dialog.user} onClose={close} />}
    </div>
  );
}
