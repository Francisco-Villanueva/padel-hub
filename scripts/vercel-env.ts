// Arma los archivos para pegar/importar en Vercel (Settings > Environment Variables > "Import .env"):
//   .env.vercel.production  <- .env.neon-production  (rama `production` de Neon)
//   .env.vercel.preview     <- .env.local            (rama `dev` de Neon)
// Solo lleva las 3 variables que necesita la app en ejecución. DATABASE_URL_MIGRATE (rol dueño) NO se sube a Vercel:
// las variables de Vercel también llegan a las funciones en ejecución y el dueño de las tablas saltea RLS.
// Los archivos quedan fuera de git (.env*). No imprime valores.
//   npx tsx scripts/vercel-env.ts
import { parse } from 'dotenv';
import { readFileSync, writeFileSync } from 'node:fs';

const KEYS = ['DATABASE_URL', 'DATABASE_URL_PLATFORM', 'JWT_SECRET'] as const;
const jobs = [
  { from: '.env.neon-production', to: '.env.vercel.production', label: 'Production' },
  { from: '.env.local', to: '.env.vercel.preview', label: 'Preview + Development' },
] as const;

const seen: Record<string, string> = {};
for (const j of jobs) {
  const env = parse(readFileSync(j.from, 'utf8'));
  for (const k of KEYS) if (!env[k]) throw new Error(`${j.from}: falta ${k}`);
  if (env.JWT_SECRET.length < 32) throw new Error(`${j.from}: JWT_SECRET demasiado corto`);
  writeFileSync(j.to, KEYS.map((k) => `${k}=${env[k]}`).join('\n') + '\n');
  const host = new URL(env.DATABASE_URL).hostname;
  seen[j.label] = host;
  console.log(`${j.to}  <-  ${j.from}  (${j.label}; base ${host})`);
}
if (seen.Production === seen['Preview + Development']) throw new Error('Producción y desarrollo apuntan a la MISMA base: revisá los archivos');

// Producción y desarrollo no deben compartir claves.
const [p, d] = jobs.map((j) => parse(readFileSync(j.to, 'utf8')));
for (const k of KEYS) if (p[k] === d[k]) throw new Error(`${k} es igual en producción y desarrollo`);
console.log('OK: bases y claves distintas entre producción y desarrollo.');
