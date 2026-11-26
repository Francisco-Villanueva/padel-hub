import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tournamentInputSchema } from '../src/lib/tournament-schema';
import { playerConsents, players } from '../src/server/db/schema';
import type { Tx } from '../src/server/db/tenant';
import { FeatureDisabledError, setClubFeature } from '../src/server/services/features';
import { listCandidates } from '../src/server/services/candidates';
import { listPlayers } from '../src/server/services/players';
import { listEntries, normalizeName, PLACEHOLDER_FIRST_NAME, registerPairs } from '../src/server/services/tournament-entries';
import { createTournament, openRegistration } from '../src/server/services/tournaments';
import { seedTwoClubs, setupDb } from './helpers';

type Ctx = Awaited<ReturnType<typeof setupDb>>;
let t: Ctx;
let s: Awaited<ReturnType<typeof seedTwoClubs>>;
let ca: { clubId: string; userId: string; country: string };
const A = <T>(fn: (tx: Tx) => Promise<T>) => t.withTenant(s.a.id, fn);

beforeAll(async () => {
  t = await setupDb();
  s = await seedTwoClubs(t);
  ca = { clubId: s.a.id, userId: s.ownerA, country: 'AR' };
  await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerA }, s.a.id, 'tournaments', true));
});
afterAll(async () => { await t.client.close(); });

const input = (over: Record<string, unknown> = {}) => tournamentInputSchema.parse({
  name: '7ma libre', modality: 'libre', ruleKind: 'single', ruleValue: 7, isRanked: true, minPairs: 6, championPoints: 1000, participationPoints: 5, startsOn: '2026-12-05', ...over,
});
async function open(over: Record<string, unknown> = {}) {
  const id = await A((tx) => createTournament(tx, ca, input(over)));
  await A((tx) => openRegistration(tx, ca, id));
  return id;
}
const byLast = (last: string) => A((tx) => tx.select().from(players).where(eq(players.lastName, last)));

describe('inscripción rápida por nombres', () => {
  it('crea jugadores nuevos sin teléfono, con la categoría del torneo, consentimiento y nombre provisorio', async () => {
    const id = await open();
    const [r] = await A((tx) => registerPairs(tx, ca, id, [{ p1: { lastName: 'Cardoso' }, p2: { lastName: 'Weber', firstName: 'Pablo' } }]));
    expect(r).toMatchObject({ ok: true, created: 2, reused: 0 });
    const [c] = await byLast('Cardoso');
    expect(c).toMatchObject({ firstName: PLACEHOLDER_FIRST_NAME, category: 7, gender: 'male', phoneE164: null, source: 'manual' });
    expect(await A((tx) => tx.select().from(playerConsents).where(eq(playerConsents.playerId, c.id)))).toHaveLength(1);
    expect((await A((tx) => listEntries(tx, ca, id))).map((e) => [e.player1.lastName, e.player2.lastName])).toEqual([['Cardoso', 'Weber']]);
  });

  it('usa al jugador del club si el nombre coincide (sin tildes, mayúsculas ni orden) o si el apellido es único', async () => {
    const id = await open();
    const mk = async (first: string, last: string, phone: string) => (await A((tx) => tx.insert(players).values({ clubId: s.a.id, firstName: first, lastName: last, gender: 'male', category: 7, phoneE164: phone, source: 'manual' }).returning({ id: players.id })))[0].id;
    const lopez = await mk('Martín', 'López', '+5491155550001');
    await mk('Juan', 'Gómez', '+5491155550002');
    await mk('Pedro', 'Gómez', '+5491155550003');
    const [r] = await A((tx) => registerPairs(tx, ca, id, [
      { p1: { firstName: 'martin', lastName: 'lopez' }, p2: { lastName: 'Gómez', firstName: 'Juan' } },
    ]));
    expect(r).toMatchObject({ ok: true, created: 0, reused: 2 });
    expect((await A((tx) => listEntries(tx, ca, id)))[0].player1Id).toBe(lopez);
    // Apellido repetido en el club ("Gómez" ×2) y sin nombre: no se adivina, se crea uno nuevo.
    const [r2] = await A((tx) => registerPairs(tx, ca, id, [{ p1: { lastName: 'Gómez' }, p2: { lastName: 'Nuevo' } }]));
    expect(r2).toMatchObject({ ok: true, created: 2, reused: 0 });
    // Con nombre y apellido sí se encuentra a uno de los dos Gómez.
    const [r3] = await A((tx) => registerPairs(tx, ca, id, [{ p1: { firstName: 'Pedro', lastName: 'Gómez' }, p2: { firstName: 'Otro', lastName: 'Jugador' } }]));
    expect(r3).toMatchObject({ ok: true, created: 1, reused: 1 });
  });

  it('cada fila es independiente: una que falla no frena a las demás ni deja jugadores a medias', async () => {
    const id = await open();
    const res = await A((tx) => registerPairs(tx, ca, id, [
      { p1: { lastName: 'Uno' }, p2: { lastName: 'Dos' } },
      { p1: { lastName: 'Uno' }, p2: { lastName: 'Tres' } }, // "Uno" ya está en la fila 1: jugador repetido
      { p1: { lastName: 'Cuatro' }, p2: { lastName: '' } },  // falta un apellido
      { p1: { lastName: 'Cinco' }, p2: { lastName: 'Seis' } },
    ]));
    expect(res.map((r) => (r.ok ? 'ok' : r.error))).toEqual(['ok', 'player_taken', 'pair_missing_names', 'ok']);
    expect(await byLast('Tres')).toHaveLength(0); // la fila 2 se deshizo completa
    expect(await byLast('Cuatro')).toHaveLength(0);
    expect(await A((tx) => listEntries(tx, ca, id))).toHaveLength(2);
  });

  it('género por defecto según la modalidad y categoría obligatoria en "suma"', async () => {
    const mixto = await open({ modality: 'mixto' });
    await A((tx) => registerPairs(tx, ca, mixto, [{ p1: { lastName: 'MixA' }, p2: { lastName: 'MixB' } }]));
    expect([(await byLast('MixA'))[0].gender, (await byLast('MixB'))[0].gender]).toEqual(['male', 'female']);
    const fem = await open({ modality: 'femenino' });
    await A((tx) => registerPairs(tx, ca, fem, [{ p1: { lastName: 'FemA' }, p2: { lastName: 'FemB' } }]));
    expect([(await byLast('FemA'))[0].gender, (await byLast('FemB'))[0].gender]).toEqual(['female', 'female']);

    const sum = await open({ ruleKind: 'sum', ruleValue: 13 });
    const [bad] = await A((tx) => registerPairs(tx, ca, sum, [{ p1: { lastName: 'SumA' }, p2: { lastName: 'SumB' } }]));
    expect(bad).toMatchObject({ ok: false, error: 'pair_invalid', detail: { reason: 'no_category' } });
    const [ok] = await A((tx) => registerPairs(tx, ca, sum, [{ p1: { lastName: 'SumC', category: 6 }, p2: { lastName: 'SumD', category: 7 } }]));
    expect(ok).toMatchObject({ ok: true });
  });

  it('no usa jugadores de otro club, exige inscripción abierta y el flag', async () => {
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', true));
    await t.withTenant(s.b.id, (tx) => tx.insert(players).values({ clubId: s.b.id, firstName: 'Ajeno', lastName: 'Zeta', gender: 'male', category: 7, phoneE164: '+5491155550099', source: 'manual' }));
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', false));
    const id = await open();
    const [r] = await A((tx) => registerPairs(tx, ca, id, [{ p1: { lastName: 'Zeta' }, p2: { lastName: 'Eta' } }]));
    expect(r).toMatchObject({ ok: true, created: 2 }); // se creó uno propio: el de B no se ve
    const draft = await A((tx) => createTournament(tx, ca, input()));
    await expect(A((tx) => registerPairs(tx, ca, draft, []))).rejects.toMatchObject({ code: 'invalid_state' });
    await expect(t.withTenant(s.b.id, (tx) => registerPairs(tx, { clubId: s.b.id }, id, []))).rejects.toBeInstanceOf(FeatureDisabledError);
  });
});

describe('jugadores sin teléfono', () => {
  it('aparecen en la lista de jugadores, no se les ofrece WhatsApp en "Falta el cuarto" y no rompen la búsqueda', async () => {
    const id = await open();
    await A((tx) => registerPairs(tx, ca, id, [{ p1: { lastName: 'SinTel1' }, p2: { lastName: 'SinTel2' } }]));
    const list = await A((tx) => listPlayers(tx, { q: 'SinTel1' }));
    expect(list.rows[0]).toMatchObject({ lastName: 'SinTel1', phoneE164: null });
    const cands = await A((tx) => listCandidates(tx, { page: 1 } as never));
    expect(cands.rows.some((c) => c.lastName === 'SinTel1')).toBe(false);
    expect(normalizeName('  Ñandú  GÓMEZ ')).toBe('nandu gomez');
  });
});
