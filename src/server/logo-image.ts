// Procesa el archivo que sube el dueño ANTES de guardarlo: no se confía en el nombre ni en el tipo que declara el navegador.
// Se verifica el contenido real, se vuelve a codificar a WebP (descarta metadatos, EXIF y cualquier carga escondida en el
// archivo) y se reduce de tamaño. Lo que se guarda y se sirve es siempre un WebP generado acá.
import sharp from 'sharp';
import { LOGO_MAX_BYTES, LOGO_MIN_SIDE, LOGO_OUT_SIDE, type LogoErrorCode } from '../lib/logo';

export class LogoError extends Error {
  constructor(readonly code: LogoErrorCode) { super(code); }
}

/** Tipo según los primeros bytes. null = no es PNG, JPEG ni WebP (por ejemplo SVG, GIF o un texto renombrado). */
export function sniffImageType(b: Uint8Array): 'png' | 'jpeg' | 'webp' | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((v, k) => b[i + k] === v);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return 'jpeg';
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'webp';
  return null;
}

// Tope de píxeles de entrada: una imagen "pequeña" en bytes puede descomprimirse a miles de millones de píxeles.
const MAX_INPUT_PIXELS = 16_000_000;
const MAX_OUTPUT_BYTES = 600_000; // mismo límite que la restricción de la base

export async function processLogo(input: Uint8Array): Promise<{ data: Buffer; width: number; height: number }> {
  if (input.length === 0) throw new LogoError('no_file');
  if (input.length > LOGO_MAX_BYTES) throw new LogoError('too_large');
  if (!sniffImageType(input)) throw new LogoError('bad_type');

  try {
    const img = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', animated: false });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) throw new LogoError('invalid_image');
    if (Math.min(meta.width, meta.height) < LOGO_MIN_SIDE) throw new LogoError('too_small');

    for (const quality of [88, 72, 55]) {
      const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', animated: false })
        .rotate() // respeta la orientación de la cámara y descarta el EXIF
        .resize(LOGO_OUT_SIDE, LOGO_OUT_SIDE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });
      if (data.length <= MAX_OUTPUT_BYTES) return { data, width: info.width, height: info.height };
    }
    throw new LogoError('invalid_image');
  } catch (e) {
    if (e instanceof LogoError) throw e;
    // Archivo corrupto, truncado o con demasiados píxeles.
    throw new LogoError('invalid_image');
  }
}
