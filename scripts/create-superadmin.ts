// Crea (o promueve) un superadmin de Duxio.
//   npx tsx scripts/create-superadmin.ts --email yo@duxio.com --name "Nombre" --password "clave de 10+ caracteres"
import { eq } from 'drizzle-orm';
import { hashPassword, passwordProblem } from '../src/server/auth/password';
import { users } from '../src/server/db/schema';
import { arg, runners } from './_db';

async function main() {
  const email = arg('email')?.trim().toLowerCase(), name = arg('name'), password = arg('password');
  if (!email || !name || !password) throw new Error('Uso: --email <email> --name <nombre> --password <clave>');
  if (passwordProblem(password)) throw new Error('La contraseña debe tener entre 10 y 200 caracteres');
  const r = runners();
  try {
    const passwordHash = await hashPassword(password);
    await r.withPlatform(async (tx) => {
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (existing) await tx.update(users).set({ isSuperadmin: true, passwordHash, disabledAt: null, failedLogins: 0, lockedUntil: null }).where(eq(users.id, existing.id));
      else await tx.insert(users).values({ email, name, passwordHash, isSuperadmin: true });
    });
    console.log(`Superadmin listo: ${email}`);
  } finally { await r.close(); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
