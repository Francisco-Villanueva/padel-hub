import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import * as schema from '../src/server/db/schema';
import { createRunners, type Db } from '../src/server/db/tenant';
import { createClub } from '../src/server/services/clubs';

// Postgres real en memoria (PGlite) con las migraciones del repo aplicadas.
// Una sola conexión superusuario; los runners cambian de rol con SET LOCAL ROLE,
// así RLS y grants se prueban igual que con app_user / platform_user en Neon.
export async function setupDb() {
  const client = new PGlite({ extensions: { citext } });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../drizzle') });
  const runners = createRunners(db as unknown as Db, undefined, { app: 'app_user', platform: 'platform_user' });
  return { client, db, ...runners };
}

export async function seedTwoClubs(r: ReturnType<typeof createRunners>) {
  const mk = (slug: string) =>
    r.withPlatform((tx) =>
      createClub(tx, { slug, name: `Club ${slug}`, owner: { email: `owner@${slug}.test`, name: `Owner ${slug}`, passwordHash: 'x' } }),
    );
  const a = await mk('club-a');
  const b = await mk('club-b');
  return { a: a.club, b: b.club, ownerA: a.ownerId, ownerB: b.ownerId };
}
