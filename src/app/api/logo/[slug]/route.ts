import { NextResponse, type NextRequest } from 'next/server';
import { withPlatform } from '@/server/db/client';
import { getPublicLogo } from '@/server/services/club-logo';

// Logo público del club (lo ve cualquiera que abra el formulario de alta). Solo sirve el WebP que generó el servidor al subirlo.
// La URL lleva `?v=<versión>`: cada logo nuevo es otra URL, así que puede cachearse "para siempre".
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const logo = await withPlatform((tx) => getPublicLogo(tx, slug));
  if (!logo) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });

  const etag = `"${logo.updatedAt.getTime()}-${logo.data.length}"`;
  const cache = req.nextUrl.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=300, stale-while-revalidate=86400';
  if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cache } });

  return new NextResponse(new Uint8Array(logo.data), {
    headers: {
      'Content-Type': logo.contentType,
      'Content-Length': String(logo.data.length),
      'Cache-Control': cache,
      ETag: etag,
      // Es una imagen generada por el servidor (WebP): con nosniff ningún navegador la trata como otra cosa.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
