"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { cx, ui } from "@/components/ui";

/** Campo de contraseña con ojo para ver lo que se escribe. Mismo contrato que un <input>. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const t = useTranslations("common");
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={cx(ui.input, "pr-12", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-md text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {visible ? (
            <>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <path d="m1 1 22 22" />
            </>
          ) : (
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

type NewPasswordProps = {
  id: string;
  name: string;
  label: string;
  invalid?: boolean;
  describedBy?: string;
  hint?: string;
};

/**
 * Contraseña nueva + confirmación. Si no coinciden el formulario no se envía
 * (validación nativa con mensaje traducido). La confirmación no viaja al servidor.
 */
export function NewPasswordFields({ id, name, label, invalid, describedBy, hint }: NewPasswordProps) {
  const t = useTranslations("common");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const confirmRef = useRef<HTMLInputElement>(null);
  const mismatch = confirm !== "" && confirm !== password;

  useEffect(() => {
    confirmRef.current?.setCustomValidity(confirm !== password ? t("passwordMismatch") : "");
  }, [password, confirm, t]);

  return (
    <>
      <div>
        <label htmlFor={id} className={ui.label}>{label}</label>
        <PasswordInput
          id={id} name={name} required minLength={10} maxLength={200} autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          aria-invalid={invalid || undefined} aria-describedby={describedBy}
        />
        {hint && <p className={ui.hint}>{hint}</p>}
      </div>
      <div>
        <label htmlFor={`${id}-confirm`} className={ui.label}>{t("confirmPassword")}</label>
        <PasswordInput
          id={`${id}-confirm`} ref={confirmRef} required minLength={10} maxLength={200} autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch || undefined} aria-describedby={mismatch ? `${id}-mismatch` : undefined}
        />
        {mismatch && <p id={`${id}-mismatch`} role="alert" className={ui.error}>{t("passwordMismatch")}</p>}
      </div>
    </>
  );
}
