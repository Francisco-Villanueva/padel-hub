import 'server-only';
import { db } from '../db/client';
import { hashPassword, verifyPassword } from './password';
import { createAuthService, type AuthService } from './service';

let cached: AuthService | undefined;
let dummy: Promise<string> | undefined;

// El hash señuelo (para igualar tiempos cuando el email no existe) se calcula una vez por instancia.
export async function getAuth(): Promise<AuthService> {
  if (cached) return cached;
  dummy ??= hashPassword(crypto.randomUUID());
  const dummyHash = await dummy;
  return (cached ??= createAuthService({ runners: db(), secret: process.env.JWT_SECRET ?? '', verifyPassword, dummyHash }));
}
