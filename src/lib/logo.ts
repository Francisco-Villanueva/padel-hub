// Reglas del logo del club compartidas entre el formulario (cliente) y el servidor.
/** Tamaño máximo del archivo que sube el dueño. Después se reduce a un WebP chico. */
export const LOGO_MAX_BYTES = 1024 * 1024;
/** Lado mínimo: menos que esto se ve borroso en el encabezado. */
export const LOGO_MIN_SIDE = 64;
/** Se guarda como máximo a 512 px de lado: sobra para cualquier pantalla donde se muestra. */
export const LOGO_OUT_SIDE = 512;
/** Formatos aceptados. SVG y GIF no: un SVG puede llevar scripts y un GIF puede estar animado. */
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp';
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type LogoErrorCode = 'too_large' | 'bad_type' | 'invalid_image' | 'too_small' | 'no_file';
