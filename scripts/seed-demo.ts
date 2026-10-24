// Club de demostración con jugadores ficticios, para desarrollo. NO correr en producción.
//   npx tsx --conditions=react-server scripts/seed-demo.ts --password "clave de 10+ caracteres"
// Crea el club "demo-padel" (dueño y empleado) y 48 jugadores. Si el club ya existe, no hace nada.
import { eq } from 'drizzle-orm';
import { hashPassword, passwordProblem } from '../src/server/auth/password';
import { clubMembers, clubs, users, type Locale } from '../src/server/db/schema';
import { SLOTS, type PlayerInput } from '../src/lib/player-schema';
import { createClub } from '../src/server/services/clubs';
import { createPlayer } from '../src/server/services/players';
import { arg, runners } from './_db';

const FIRST_M = ['Juan', 'Martín', 'Lucas', 'Matías', 'Nicolás', 'Santiago', 'Facundo', 'Federico', 'Tomás', 'Agustín', 'Diego', 'Gonzalo'];
const FIRST_F = ['María', 'Sofía', 'Lucía', 'Valentina', 'Camila', 'Julieta', 'Florencia', 'Agustina', 'Paula', 'Carolina', 'Romina', 'Daniela'];
const LAST = ['Pérez', 'González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Romero', 'Díaz', 'Álvarez', 'Torres', 'Ruiz', 'Gómez', 'Castro', 'Acosta', 'Benítez'];
const LOCALITIES = ['Bahía Blanca', 'Punta Alta', 'Cerri', 'Villa Mitre', undefined];
const POS = ['drive', 'reves', 'drive_zurdo', undefined] as const;

// Generador determinístico: el seed siempre produce los mismos jugadores.
let seed = 42;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];

async function main() {
  const password = arg('password');
  if (!password || passwordProblem(password)) throw new Error('Uso: --password <clave de 10+ caracteres>');
  const r = runners();
  try {
    const [existing] = await r.withPlatform((tx) => tx.select({ id: clubs.id }).from(clubs).where(eq(clubs.slug, 'demo-padel')));
    if (existing) return console.log('El club demo-padel ya existe; no se hizo nada.');

    const passwordHash = await hashPassword(password);
    const { club } = await r.withPlatform(async (tx) => {
      const created = await createClub(tx, { slug: 'demo-padel', name: 'Demo Pádel Club', locale: 'es' as Locale, owner: { email: 'dueno@demo.padelhub.dev', name: 'Dueño Demo', passwordHash } });
      const [staff] = await tx.insert(users).values({ email: 'empleado@demo.padelhub.dev', name: 'Empleado Demo', passwordHash }).returning({ id: users.id });
      await tx.insert(clubMembers).values({ clubId: created.club.id, userId: staff.id, role: 'staff' });
      return created;
    });

    let n = 0;
    for (let i = 0; n < 48 && i < 200; i++) {
      const female = rnd() < 0.45;
      const level = pick([5, 6, 6, 7, 7, 7, 8, 8]);
      const slots = SLOTS.filter(() => rnd() < 0.4);
      const first = pick(female ? FIRST_F : FIRST_M), last = pick(LAST);
      const input: PlayerInput = {
        firstName: first, lastName: last, gender: female ? 'female' : 'male', category: level,
        position: pick(POS), slots: slots.length ? slots : ['noche'], phone: `2914${Math.floor(100000 + rnd() * 899999)}`,
        instagram: rnd() < 0.4 ? `${first}.${last}`.toLowerCase().normalize('NFD').replace(/[^a-z0-9.]/g, '') : undefined,
        locality: pick(LOCALITIES), notes: undefined,
      };
      try {
        await r.withTenant(club.id, (tx) => createPlayer(tx, { clubId: club.id, country: 'AR' }, input, { textVersion: 'seed-demo', locale: 'es' }));
        n++;
      } catch { /* teléfono inválido o repetido: se descarta */ }
    }
    console.log(`Club demo creado con ${n} jugadores.\nDueño: dueno@demo.padelhub.dev\nEmpleado: empleado@demo.padelhub.dev`);
  } finally { await r.close(); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
