import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOGO_MAX_BYTES } from '../src/lib/logo';
import { auditLog, clubLogos, clubs } from '../src/server/db/schema';
import { LogoError, processLogo, sniffImageType } from '../src/server/logo-image';
import { getPublicLogo, logoUrlFor, removeLogo, saveLogo } from '../src/server/services/club-logo';
import { seedTwoClubs, setupDb } from './helpers';

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 30, b: 60, alpha: 0.6 } } }).png().toBuffer();
// Texto del error de Postgres (el de Drizzle solo trae la consulta); sirve para comprobar QUÉ restricción saltó.
const pgError = async (p: Promise<unknown>) => { try { await p; return ''; } catch (e) { const c = (e as { cause?: { message?: string } }).cause; return c?.message ?? String(e); } };
const code = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof LogoError ? e.code : `otro:${e}`; } };

describe('procesamiento de la imagen', () => {
  it('acepta PNG, JPEG y WebP y siempre devuelve un WebP de a lo sumo 512 px', async () => {
    const cases = [
      await png(1200, 800),
      await sharp({ create: { width: 900, height: 900, channels: 3, background: '#0b6b4f' } }).jpeg().toBuffer(),
      await sharp({ create: { width: 300, height: 300, channels: 3, background: '#e4572e' } }).webp().toBuffer(),
    ];
    for (const input of cases) {
      const out = await processLogo(input);
      expect(sniffImageType(out.data)).toBe('webp');
      expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(512);
      expect((await sharp(out.data).metadata()).format).toBe('webp');
    }
  });

  it('no agranda una imagen chica y conserva la transparencia', async () => {
    const out = await processLogo(await png(200, 100));
    expect([out.width, out.height]).toEqual([200, 100]);
    expect((await sharp(out.data).metadata()).hasAlpha).toBe(true);
  });

  it('descarta los metadatos (EXIF) del archivo original', async () => {
    const withExif = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#333' } })
      .jpeg().withExif({ IFD0: { Copyright: 'dato-privado', Artist: 'alguien' } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeTruthy(); // el original sí lo traía
    const out = await processLogo(withExif);
    expect((await sharp(out.data).metadata()).exif).toBeUndefined();
    expect(out.data.includes(Buffer.from('dato-privado'))).toBe(false);
  });

  it('rechaza lo que no es PNG/JPEG/WebP aunque venga con otra extensión: SVG, GIF, texto, HTML', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script></svg>');
    const gif = Buffer.from('47494638396101000100800000ffffff00000021f90401000000002c00000000010001000002024401003b', 'hex');
    for (const bad of [svg, gif, Buffer.from('hola'), Buffer.from('<html><script>alert(1)</script></html>')]) {
      expect(await code(processLogo(bad))).toBe('bad_type');
    }
  });

  it('rechaza archivos vacíos, demasiado grandes, muy chicos y corruptos', async () => {
    expect(await code(processLogo(new Uint8Array()))).toBe('no_file');
    expect(await code(processLogo(Buffer.alloc(LOGO_MAX_BYTES + 1, 1)))).toBe('too_large');
    expect(await code(processLogo(await png(40, 40)))).toBe('too_small');
    const truncated = (await png(300, 300)).subarray(0, 60); // cabecera válida, cuerpo cortado
    expect(await code(processLogo(truncated))).toBe('invalid_image');
    const header = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('basura-que-no-es-png')]);
    expect(await code(processLogo(header))).toBe('invalid_image');
  });

  it('rechaza una imagen con demasiados píxeles (bomba de descompresión)', async () => {
    const huge = await sharp({ create: { width: 6000, height: 6000, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer();
    expect(huge.length).toBeLessThan(LOGO_MAX_BYTES); // pesa poco, pero se descomprime a 36 millones de píxeles
    expect(await code(processLogo(huge))).toBe('invalid_image');
  });
});

describe('guardado y aislamiento por club', () => {
  let t: Awaited<ReturnType<typeof setupDb>>;
  let s: Awaited<ReturnType<typeof seedTwoClubs>>;
  const ctxA = () => ({ clubId: s.a.id, userId: s.ownerA, slug: 'club-a' });
  let logo: Buffer;

  beforeAll(async () => {
    t = await setupDb();
    s = await seedTwoClubs(t);
    logo = (await processLogo(await png(400, 400))).data;
  });
  afterAll(async () => { await t.client.close(); });

  it('guarda el logo, actualiza la URL versionada y deja constancia', async () => {
    const url = await t.withTenant(s.a.id, (tx) => saveLogo(tx, ctxA(), logo));
    expect(url).toMatch(/^\/api\/logo\/club-a\?v=\d+$/);
    const [c] = await t.withPlatform((tx) => tx.select({ logoUrl: clubs.logoUrl }).from(clubs).where(eq(clubs.id, s.a.id)));
    expect(c.logoUrl).toBe(url);
    const log = await t.withPlatform((tx) => tx.select().from(auditLog).where(eq(auditLog.action, 'club.logo.update')));
    expect(log).toHaveLength(1);
    expect(logoUrlFor('x-club', 5)).toBe('/api/logo/x-club?v=5');
  });

  it('subir otro logo reemplaza el anterior y cambia la versión de la URL', async () => {
    const first = (await t.withPlatform((tx) => tx.select({ u: clubs.logoUrl }).from(clubs).where(eq(clubs.id, s.a.id))))[0].u;
    await new Promise((r) => setTimeout(r, 5));
    const other = (await processLogo(await png(300, 200))).data;
    const second = await t.withTenant(s.a.id, (tx) => saveLogo(tx, ctxA(), other));
    expect(second).not.toBe(first);
    expect(await t.withPlatform((tx) => tx.select().from(clubLogos).where(eq(clubLogos.clubId, s.a.id)))).toHaveLength(1);
    const pub = await t.withPlatform((tx) => getPublicLogo(tx, 'club-a'));
    expect(pub?.data.equals(other)).toBe(true);
  });

  it('el logo se sirve como WebP y solo de clubes activos', async () => {
    const pub = await t.withPlatform((tx) => getPublicLogo(tx, 'club-a'));
    expect(pub?.contentType).toBe('image/webp');
    expect(sniffImageType(pub!.data)).toBe('webp');
    expect(await t.withPlatform((tx) => getPublicLogo(tx, 'club-b'))).toBeNull(); // sin logo
    expect(await t.withPlatform((tx) => getPublicLogo(tx, 'no-existe'))).toBeNull();
    expect(await t.withPlatform((tx) => getPublicLogo(tx, "club-a'; drop table clubs;--"))).toBeNull();
    await t.withPlatform((tx) => tx.update(clubs).set({ status: 'suspended' }).where(eq(clubs.id, s.a.id)));
    expect(await t.withPlatform((tx) => getPublicLogo(tx, 'club-a'))).toBeNull(); // suspendido: no se publica
    await t.withPlatform((tx) => tx.update(clubs).set({ status: 'active' }).where(eq(clubs.id, s.a.id)));
  });

  it('un club no ve ni puede pisar el logo de otro', async () => {
    expect(await t.withTenant(s.b.id, (tx) => tx.select().from(clubLogos))).toHaveLength(0);
    // B intenta escribir un logo con el id del club A: la política de filas lo rechaza.
    await expect(t.withTenant(s.b.id, (tx) => tx.insert(clubLogos).values({ clubId: s.a.id, data: Buffer.from('x') }).onConflictDoUpdate({ target: clubLogos.clubId, set: { data: Buffer.from('x') } }))).rejects.toThrow();
    // ... ni borrarlo.
    await t.withTenant(s.b.id, (tx) => tx.delete(clubLogos).where(eq(clubLogos.clubId, s.a.id)));
    expect(await t.withPlatform((tx) => getPublicLogo(tx, 'club-a'))).not.toBeNull();
  });

  it('la base rechaza contenido que no sea WebP o que pase de 600 KB', async () => {
    expect(await pgError(t.withPlatform((tx) => tx.execute(sql`update club_logos set content_type = 'image/svg+xml' where club_id = ${s.a.id}`)))).toContain('club_logos_type_chk');
    expect(await pgError(t.withTenant(s.b.id, (tx) => tx.insert(clubLogos).values({ clubId: s.b.id, data: Buffer.alloc(600_001, 1) })))).toContain('club_logos_size_chk');
    expect(await pgError(t.withTenant(s.b.id, (tx) => tx.insert(clubLogos).values({ clubId: s.b.id, data: Buffer.alloc(0) })))).toContain('club_logos_size_chk');
  });

  it('quitar el logo lo borra y limpia la URL', async () => {
    await t.withTenant(s.a.id, (tx) => removeLogo(tx, { clubId: s.a.id, userId: s.ownerA }));
    expect(await t.withPlatform((tx) => getPublicLogo(tx, 'club-a'))).toBeNull();
    const [c] = await t.withPlatform((tx) => tx.select({ logoUrl: clubs.logoUrl }).from(clubs).where(eq(clubs.id, s.a.id)));
    expect(c.logoUrl).toBeNull();
    expect(await t.withPlatform((tx) => tx.select().from(auditLog).where(eq(auditLog.action, 'club.logo.remove')))).toHaveLength(1);
  });

  it('borrar el club borra su logo (cascada)', async () => {
    await t.withTenant(s.b.id, (tx) => saveLogo(tx, { clubId: s.b.id, userId: s.ownerB, slug: 'club-b' }, logo));
    await t.withPlatform((tx) => tx.delete(clubs).where(eq(clubs.id, s.b.id)));
    expect(await t.withPlatform((tx) => tx.select().from(clubLogos).where(eq(clubLogos.clubId, s.b.id)))).toHaveLength(0);
  });
});
