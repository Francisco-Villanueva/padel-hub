// Aislamiento por club. Toda consulta de negocio pasa por withTenant() o withPlatform().
//
// withTenant(clubId): transacción con app.club_id fijado. El rol de la conexión (app_user) no tiene
//   BYPASSRLS, así que las policies filtran todo por club.
// withPlatform(): conexión con platform_user (auth, superadmin, jobs). Ve todos los clubes.
//   Solo se usa desde código de confianza; cada uso sensible deja registro en audit_log.
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Runners {
  withTenant<T>(clubId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  withPlatform<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

// `sessionRole` solo se usa en tests, donde una única conexión superusuario simula los dos roles.
// En producción cada runner recibe su propia conexión ya autenticada como app_user / platform_user.
export function createRunners(appDb: Db, platformDb: Db = appDb, sessionRole?: { app: string; platform: string }): Runners {
  return {
    async withTenant(clubId, fn) {
      if (!UUID_RE.test(clubId)) throw new Error('clubId inválido');
      return appDb.transaction(async (tx) => {
        if (sessionRole) await tx.execute(sql.raw(`set local role ${sessionRole.app}`));
        await tx.execute(sql`select set_config('app.club_id', ${clubId}, true)`);
        return fn(tx);
      });
    },
    async withPlatform(fn) {
      return platformDb.transaction(async (tx) => {
        if (sessionRole) await tx.execute(sql.raw(`set local role ${sessionRole.platform}`));
        return fn(tx);
      });
    },
  };
}
