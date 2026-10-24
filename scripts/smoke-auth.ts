// Prueba de humo del servicio de auth contra la base real (login, refresh rotativo, reuso, logout).
// Crea un club temporal con una clave descartable y lo borra al terminar.
//   npx tsx scripts/smoke-auth.ts
import { randomBytes } from 'node:crypto';
import { like } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../src/server/auth/password';
import { createAuthService } from '../src/server/auth/service';
import { clubs, users } from '../src/server/db/schema';
import { createClub } from '../src/server/services/clubs';
import { runners } from './_db';

const tag = `smokeauth-${Date.now().toString(36)}`;
let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) failed++; };

async function main() {
  const r = runners();
  try {
    const password = randomBytes(12).toString('base64url');
    const email = `${tag}@smoke.test`;
    await r.withPlatform(async (tx) => createClub(tx, { slug: tag, name: 'Smoke Auth', owner: { email, name: 'Smoke', passwordHash: await hashPassword(password) } }));
    const svc = createAuthService({ runners: r, secret: process.env.JWT_SECRET!, verifyPassword, dummyHash: await hashPassword('dummy-dummy-dummy') });

    check('clave incorrecta rechazada', (await svc.login({ email, password: 'incorrecta-123' }, { ip: '203.0.113.9' })).status === 'invalid_credentials');
    const login = await svc.login({ email, password }, { ip: '203.0.113.9' });
    check('login correcto', login.status === 'ok');
    if (login.status !== 'ok') return;
    const first = login.tokens;
    check('rol dueño con club', first.session.role === 'owner' && first.session.clubId !== null);

    const rotated = await svc.refresh(first.refreshToken);
    check('refresh rota el token', rotated.status === 'ok' && rotated.tokens.refreshToken !== first.refreshToken);
    check('reuso inmediato = concurrente (no revoca)', (await svc.refresh(first.refreshToken)).status === 'concurrent');
    if (rotated.status === 'ok') {
      await svc.logout(rotated.tokens.refreshToken);
      check('logout invalida la sesión', (await svc.refresh(rotated.tokens.refreshToken)).status === 'invalid');
    }
  } finally {
    await r.withPlatform(async (tx) => {
      await tx.delete(clubs).where(like(clubs.slug, `${tag}%`));
      await tx.delete(users).where(like(users.email, `${tag}%`));
    });
    await r.close();
  }
  console.log(failed ? `\n${failed} chequeo(s) fallaron` : '\nTodo OK; datos temporales borrados.');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
