// Prueba de humo contra la base real: aislamiento por club con los roles reales (app_user / platform_user).
// Crea datos temporales y los borra al terminar. Se puede correr en cualquier rama de Neon.
//   npx tsx scripts/smoke-neon.ts
import { eq, inArray, like, sql } from 'drizzle-orm';
import { clubs, players, users } from '../src/server/db/schema';
import { createClub } from '../src/server/services/clubs';
import { runners } from './_db';

const tag = `smoke-${Date.now().toString(36)}`;
let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) failed++; };
const rejects = async (p: Promise<unknown>) => { try { await p; return false; } catch { return true; } };

async function main() {
  const r = runners();
  try {
    const mk = (s: string) => r.withPlatform((tx) => createClub(tx, { slug: `${tag}-${s}`, name: `Smoke ${s}`, owner: { email: `${tag}-${s}@smoke.test`, name: s, passwordHash: 'x' } }));
    const a = await mk('a'), b = await mk('b');
    const mkPlayer = (clubId: string, phone: string) =>
      r.withTenant(clubId, (tx) => tx.insert(players).values({ clubId, firstName: 'Test', lastName: 'Player', gender: 'male', phoneE164: phone, source: 'manual' }).returning({ id: players.id }));
    const [pa] = await mkPlayer(a.club.id, '+5491100000001');
    const [pb] = await mkPlayer(b.club.id, '+5491100000002');

    const seenByA = await r.withTenant(a.club.id, (tx) => tx.select({ id: players.id }).from(players));
    check('club A solo ve su jugador', seenByA.length === 1 && seenByA[0].id === pa.id);
    check('club A no ve al jugador de B por id', (await r.withTenant(a.club.id, (tx) => tx.select().from(players).where(eq(players.id, pb.id)))).length === 0);
    check('club A no puede insertar en B', await rejects(r.withTenant(a.club.id, (tx) => tx.insert(players).values({ clubId: b.club.id, firstName: 'x', lastName: 'y', gender: 'male', phoneE164: '+5491100000003', source: 'manual' }))));
    check('app_user no lee password_hash', await rejects(r.withTenant(a.club.id, (tx) => tx.select({ h: users.passwordHash }).from(users))));
    check('app_user no cambia status del club', await rejects(r.withTenant(a.club.id, (tx) => tx.update(clubs).set({ status: 'suspended' }).where(eq(clubs.id, a.club.id)))));
    check('app_user no lee refresh_tokens', await rejects(r.withTenant(a.club.id, (tx) => tx.execute(sql`select 1 from refresh_tokens`))));
    const app = await r.withTenant(a.club.id, async (tx) => ((await tx.execute(sql`select current_user as u`)) as unknown as { rows: { u: string }[] }).rows[0]);
    check('la conexión de la app es app_user', app.u === 'app_user');
    const plat = await r.withPlatform(async (tx) => ((await tx.execute(sql`select current_user as u`)) as unknown as { rows: { u: string }[] }).rows[0]);
    check('la conexión de plataforma es platform_user', plat.u === 'platform_user');
    check('platform ve ambos jugadores', (await r.withPlatform((tx) => tx.select().from(players).where(inArray(players.id, [pa.id, pb.id])))).length === 2);
  } finally {
    await r.withPlatform(async (tx) => {
      await tx.delete(clubs).where(like(clubs.slug, `${tag}-%`));
      await tx.delete(users).where(like(users.email, `${tag}-%`));
    });
    await r.close();
  }
  console.log(failed ? `\n${failed} chequeo(s) fallaron` : '\nTodo OK; datos temporales borrados.');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
