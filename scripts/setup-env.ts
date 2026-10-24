// Prepara .env.local después de aplicar las migraciones:
//  - les da login y clave a los roles app_user y platform_user (creados NOLOGIN por la migración),
//  - arma DATABASE_URL (pooled, app_user) y DATABASE_URL_PLATFORM (pooled, platform_user),
//  - genera JWT_SECRET.
// Idempotente: si ya existen, no rota nada salvo con --rotate. No imprime claves.
//   npx tsx scripts/setup-env.ts [--rotate]
import { Pool, neonConfig } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import ws from 'ws';

const ENV = process.env.ENV_FILE ?? '.env.local'; // .env.neon-production para producción
config({ path: ENV });
neonConfig.webSocketConstructor = ws;

const rotate = process.argv.includes('--rotate');
const migrateUrl = process.env.DATABASE_URL_MIGRATE;
if (!migrateUrl) throw new Error('Falta DATABASE_URL_MIGRATE en .env.local');

const have = (k: string) => Boolean(process.env[k]);
const needRoles = rotate || !have('DATABASE_URL') || !have('DATABASE_URL_PLATFORM');
const secret = () => randomBytes(32).toString('base64url');

function roleUrl(role: string, password: string): string {
  const u = new URL(migrateUrl!);
  u.username = role;
  u.password = password;
  u.hostname = u.hostname.replace(/^([^.]+)(?<!-pooler)\./, '$1-pooler.'); // endpoint pooled
  u.searchParams.delete('channel_binding');
  return u.toString();
}

async function main() {
  const updates: Record<string, string> = {};

  if (needRoles) {
    const pool = new Pool({ connectionString: migrateUrl });
    try {
      for (const [role, key] of [['app_user', 'DATABASE_URL'], ['platform_user', 'DATABASE_URL_PLATFORM']] as const) {
        const password = secret();
        // Los roles los creó la migración 0001; aquí solo se habilita el login.
        await pool.query(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`);
        updates[key] = roleUrl(role, password);
      }
    } finally {
      await pool.end();
    }
  }
  if (rotate || !have('JWT_SECRET')) updates.JWT_SECRET = secret();

  if (Object.keys(updates).length === 0) return console.log('.env.local ya está completo. Usá --rotate para regenerar claves.');

  const lines = (existsSync(ENV) ? readFileSync(ENV, 'utf8') : '').split(/\r?\n/).filter((l) => l && !Object.keys(updates).some((k) => l.startsWith(`${k}=`)));
  for (const [k, v] of Object.entries(updates)) lines.push(`${k}=${v}`);
  writeFileSync(ENV, lines.join('\n') + '\n');
  console.log(`Actualizado ${ENV}: ${Object.keys(updates).join(', ')}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
