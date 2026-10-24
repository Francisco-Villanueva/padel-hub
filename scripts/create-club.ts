// Alta manual de un club con su usuario dueño (MVP, sin billing).
//   npx tsx scripts/create-club.ts --slug x3-padel --name "X3 Pádel Club" --owner-email dueno@x3.com --owner-name "Nombre" --password "clave de 10+ caracteres" [--locale es|en|pt] [--country AR]
import { hashPassword, passwordProblem } from '../src/server/auth/password';
import { LOCALES } from '../src/server/db/schema';
import { createClub } from '../src/server/services/clubs';
import { arg, runners } from './_db';

async function main() {
  const slug = arg('slug'), name = arg('name'), email = arg('owner-email')?.trim().toLowerCase(), ownerName = arg('owner-name'), password = arg('password');
  const locale = (arg('locale') ?? 'es') as (typeof LOCALES)[number];
  if (!slug || !name || !email || !ownerName || !password) throw new Error('Uso: --slug --name --owner-email --owner-name --password [--locale] [--country]');
  if (!LOCALES.includes(locale)) throw new Error('locale debe ser es, en o pt');
  if (passwordProblem(password)) throw new Error('La contraseña debe tener entre 10 y 200 caracteres');
  const r = runners();
  try {
    const passwordHash = await hashPassword(password);
    const { club } = await r.withPlatform((tx) =>
      createClub(tx, { slug, name, locale, country: arg('country') ?? 'AR', owner: { email, name: ownerName, passwordHash } }));
    console.log(`Club creado: ${club.name} (${club.slug}) · dueño: ${email}`);
  } finally { await r.close(); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
