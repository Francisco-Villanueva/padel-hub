// Crea los links de alta (celular y tablet) de los clubes que todavía no los tienen.
//   npx tsx --conditions=react-server scripts/ensure-signup-links.ts
import { eq } from 'drizzle-orm';
import { clubs, signupLinks } from '../src/server/db/schema';
import { newSignupToken } from '../src/server/services/clubs';
import { runners } from './_db';

async function main() {
  const r = runners();
  try {
    await r.withPlatform(async (tx) => {
      for (const club of await tx.select({ id: clubs.id, slug: clubs.slug }).from(clubs)) {
        const have = new Set((await tx.select({ kind: signupLinks.kind }).from(signupLinks).where(eq(signupLinks.clubId, club.id))).map((l) => l.kind));
        for (const kind of ['link', 'tablet'] as const) {
          if (have.has(kind)) continue;
          const token = newSignupToken();
          await tx.insert(signupLinks).values({ clubId: club.id, token, kind });
          console.log(`${club.slug}: link ${kind} creado (/c/${club.slug}/${token})`);
        }
      }
    });
  } finally {
    await r.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
