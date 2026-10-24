import 'server-only';
import { hash, verify } from '@node-rs/argon2';
import { MIN_PASSWORD_LENGTH } from './config';

// argon2id con los parámetros por defecto de la librería (m=19 MiB, t=2, p=1).
export const hashPassword = (password: string) => hash(password);

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try { return await verify(stored, password); } catch { return false; }
}

export function passwordProblem(password: string): 'too_short' | 'too_long' | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too_short';
  if (password.length > 200) return 'too_long';
  return null;
}
