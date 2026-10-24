import 'server-only';
import { hashPassword, passwordProblem } from '../auth/password';
import { withPlatform } from '../db/client';
import { appLink, sendEmail } from '../email/send';
import { createAccountService, type AccountService } from './account';

let cached: AccountService | undefined;

/** Servicio de cuentas por correo con las dependencias reales (base, Resend/consola, argon2id). */
export function getAccount(): AccountService {
  return (cached ??= createAccountService({
    runners: { withPlatform },
    secret: process.env.JWT_SECRET ?? '',
    hashPassword,
    passwordProblem,
    send: sendEmail,
    link: (path) => appLink(path),
  }));
}
