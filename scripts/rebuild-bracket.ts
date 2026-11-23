// Regenera la llave (plantilla + lugares de las zonas ya terminadas) de los torneos en juego de un club. Sirve para los torneos creados
// antes de que la llave fuera una plantilla. Pierde lo puesto a mano en la llave; no toca zonas ni resultados de zona.
//   npx tsx --conditions=react-server scripts/rebuild-bracket.ts --slug bahia-padel [--name "parte del nombre"]
// Corre sobre la base de .env.local (dev) o la de ENV_FILE; imprime el host antes de actuar.
import { eq, inArray, like } from 'drizzle-orm';
import { clubs, tournaments } from '../src/server/db/schema';
import { rebuildBracket } from '../src/server/services/tournament-bracket';
import { arg, runners } from './_db';

async function main() {
  const slug = arg('slug');
  if (!slug) throw new Error('Uso: --slug <club> [--name <texto del nombre>]');
  const name = arg('name');
  const r = runners();
  try {
    const [club] = await r.withPlatform((tx) => tx.select({ id: clubs.id }).from(clubs).where(eq(clubs.slug, slug)));
    if (!club) throw new Error(`No existe el club ${slug}.`);
    const list = await r.withTenant(club.id, (tx) => tx.select({ id: tournaments.id, name: tournaments.name, status: tournaments.status }).from(tournaments)
      .where(name ? like(tournaments.name, `%${name}%`) : inArray(tournaments.status, ['zonas', 'llave'])));
    for (const t of list.filter((x) => x.status === 'zonas' || x.status === 'llave')) {
      try {
        const res = await r.withTenant(club.id, (tx) => rebuildBracket(tx, { clubId: club.id }, t.id));
        console.log(`"${t.name}": llave regenerada (${res ? `de ${res.size}` : 'sin zonas'}).`);
      } catch (e) {
        console.log(`"${t.name}": no se pudo (${(e as Error).message}).`);
      }
    }
  } finally { await r.close(); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
