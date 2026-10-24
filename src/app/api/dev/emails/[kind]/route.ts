import { NextResponse, type NextRequest } from 'next/server';
import { renderEmail, type EmailKind, type EmailLocale } from '@/server/email/render';

// SOLO DESARROLLO: vista previa de los correos con datos de ejemplo para revisarlos en el navegador
//   /api/dev/emails/invite?locale=pt            → HTML
//   /api/dev/emails/reset?format=text           → texto plano
// En cualquier despliegue (NODE_ENV=production) responde 404.
const KINDS = ['invite', 'reset', 'passwordChanged', 'welcome'] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  if (process.env.NODE_ENV === 'production') return new NextResponse(null, { status: 404 });
  const { kind } = await params;
  if (!(KINDS as readonly string[]).includes(kind)) return NextResponse.json({ kinds: KINDS }, { status: 404 });

  const q = req.nextUrl.searchParams;
  const locale = (['es', 'en', 'pt'].includes(q.get('locale') ?? '') ? q.get('locale') : 'es') as EmailLocale;
  const base = req.nextUrl.origin;
  const mail = renderEmail(kind as EmailKind, locale, {
    assetsUrl: base, recipientName: 'Diego Sánchez', recipientEmail: 'diego@ejemplo.com', actionUrl: `${base}/${locale}/restablecer/ejemplo-ejemplo-ejemplo`,
    clubName: 'Complejo Las Palmas', inviterName: 'Marcos Rivas', role: 'staff', changedAt: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(new Date()),
    joinUrl: `${base}/${locale}/c/las-palmas/ejemplo`, activation: q.get('activation') === '1',
  });
  return q.get('format') === 'text'
    ? new NextResponse(`Asunto: ${mail.subject}\n\n${mail.text}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    : new NextResponse(mail.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
