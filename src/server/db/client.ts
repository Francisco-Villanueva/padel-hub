import 'server-only';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';
import { createRunners, type Db, type Runners } from './tenant';

// Dos conexiones pooled con roles distintos (ver drizzle/0001_rls.sql):
//   DATABASE_URL          -> app_user       (rutas del club, RLS siempre activa)
//   DATABASE_URL_PLATFORM -> platform_user  (auth, superadmin, jobs)
function connect(envVar: 'DATABASE_URL' | 'DATABASE_URL_PLATFORM'): Db {
  const url = process.env[envVar];
  if (!url) throw new Error(`Falta la variable de entorno ${envVar}`);
  return drizzle(new Pool({ connectionString: url }), { schema }) as unknown as Db;
}

let cached: Runners | undefined;
export function db(): Runners {
  return (cached ??= createRunners(connect('DATABASE_URL'), connect('DATABASE_URL_PLATFORM')));
}

export const withTenant: Runners['withTenant'] = (clubId, fn) => db().withTenant(clubId, fn);
export const withPlatform: Runners['withPlatform'] = (fn) => db().withPlatform(fn);
