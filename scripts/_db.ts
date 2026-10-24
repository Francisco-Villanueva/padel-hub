// Conexión para scripts de operación (fuera de Next). Lee .env.local.
import { Pool, neonConfig } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from '../src/server/db/schema';
import { createRunners, type Db } from '../src/server/db/tenant';

config({ path: process.env.ENV_FILE ?? '.env.local' });
neonConfig.webSocketConstructor = ws;

export function connect(envVar: 'DATABASE_URL' | 'DATABASE_URL_PLATFORM') {
  const url = process.env[envVar];
  if (!url) throw new Error(`Falta ${envVar} en .env.local (corré scripts/setup-env.ts)`);
  // Deja claro contra qué base se está operando (dev o producción).
  console.log('Base:', new URL(url).hostname, '| archivo:', process.env.ENV_FILE ?? '.env.local');
  const pool = new Pool({ connectionString: url });
  return { pool, db: drizzle(pool, { schema }) as unknown as Db };
}

export function runners() {
  const app = connect('DATABASE_URL');
  const platform = connect('DATABASE_URL_PLATFORM');
  return { ...createRunners(app.db, platform.db), close: () => Promise.all([app.pool.end(), platform.pool.end()]) };
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
