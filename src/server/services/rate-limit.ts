// Contador por ventana fija, persistente (en serverless la memoria no se comparte).
// Va dentro de withPlatform(): `rate_limits` solo es accesible para platform_user.
import { sql } from 'drizzle-orm';
import { rateLimits } from '../db/schema';
import type { Tx } from '../db/tenant';

export interface RateLimit { max: number; windowSec: number }

/** Cuenta un intento. Devuelve false si ya se superó el máximo de la ventana. */
export async function hitRateLimit(tx: Tx, key: string, limit: RateLimit, now: Date = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - limit.windowSec * 1000);
  const res = await tx.execute(sql`
    insert into ${rateLimits} (key, count, window_start) values (${key}, 1, ${now.toISOString()})
    on conflict (key) do update set
      count = case when ${rateLimits.windowStart} < ${cutoff.toISOString()} then 1 else ${rateLimits.count} + 1 end,
      window_start = case when ${rateLimits.windowStart} < ${cutoff.toISOString()} then ${now.toISOString()} else ${rateLimits.windowStart} end
    returning count`);
  return Number((res as unknown as { rows: { count: number | string }[] }).rows[0].count) <= limit.max;
}
