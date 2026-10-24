"use client";

import { useId, useState } from "react";
import { cx, ui } from "./ui";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

type Labels = { password: string; repeat: string; ruleLength: string; ruleMatch: string; mismatch: string };

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cx("flex items-center gap-2 text-sm", ok ? "text-ink" : "text-ink-muted")}>
      <svg aria-hidden viewBox="0 0 24 24" className={cx("size-4 shrink-0", ok ? "text-brand" : "text-ink-muted")} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {ok ? <path d="m5 12 5 5L20 7" /> : <path d="M6 6l12 12M18 6 6 18" />}
      </svg>
      {children}
    </li>
  );
}

/**
 * Contraseña y su repetición con la lista de requisitos en vivo. Los campos viajan como `password` y `repeat`.
 * Avisa por `onValidChange` si ya se puede enviar; igual el servidor vuelve a validar todo.
 */
export function PasswordFields({ labels, onValidChange, autoFocus }: { labels: Labels; onValidChange?: (valid: boolean) => void; autoFocus?: boolean }) {
  const id = useId();
  const [pw, setPw] = useState("");
  const [rep, setRep] = useState("");
  const longEnough = pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX;
  const match = pw.length > 0 && pw === rep;
  const showMismatch = rep.length > 0 && pw !== rep;

  const update = (nextPw: string, nextRep: string) => {
    setPw(nextPw);
    setRep(nextRep);
    onValidChange?.(nextPw.length >= PASSWORD_MIN && nextPw.length <= PASSWORD_MAX && nextPw === nextRep);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${id}-pw`} className={ui.label}>{labels.password}</label>
        <input
          id={`${id}-pw`} name="password" type="password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} autoComplete="new-password" autoFocus={autoFocus}
          value={pw} onChange={(e) => update(e.target.value, rep)} className={ui.input} aria-describedby={`${id}-rules`}
        />
      </div>
      <div>
        <label htmlFor={`${id}-rep`} className={ui.label}>{labels.repeat}</label>
        <input
          id={`${id}-rep`} name="repeat" type="password" required maxLength={PASSWORD_MAX} autoComplete="new-password"
          value={rep} onChange={(e) => update(pw, e.target.value)} className={ui.input} aria-invalid={showMismatch || undefined} aria-describedby={showMismatch ? `${id}-mismatch` : undefined}
        />
        {showMismatch && <p id={`${id}-mismatch`} role="alert" className={ui.error}>{labels.mismatch}</p>}
      </div>
      <ul id={`${id}-rules`} className="space-y-1.5" aria-live="polite">
        <Rule ok={longEnough}>{labels.ruleLength}</Rule>
        <Rule ok={match}>{labels.ruleMatch}</Rule>
      </ul>
    </div>
  );
}
