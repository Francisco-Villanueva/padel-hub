import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { withPlatform } from '@/server/db/client';
import { suspendExpiredTrials } from '@/server/services/clubs';

// Vercel Cron (vercel.json) lo llama una vez por día con `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? '';
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const suspended = await withPlatform((tx) => suspendExpiredTrials(tx));
  return NextResponse.json({ suspended: suspended.length }, { headers: { 'Cache-Control': 'no-store' } });
}
