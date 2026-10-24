// Validación compartida (formulario y servidor) de los datos de un jugador.
import { z } from 'zod';

export const GENDERS = ['male', 'female'] as const;
export const POSITIONS = ['drive', 'reves', 'drive_zurdo'] as const;
export const SLOTS = ['manana', 'tarde_temprano', 'tarde', 'noche'] as const;
/** Categorías: del 1 (la más alta) al 8. Es solo el nivel; hombre o mujer lo da el género del jugador. */
export const CATEGORIES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const emptyToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
// Llega como texto desde formularios y URL; vacío = sin categoría.
const category = z.preprocess(
  (v) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? undefined : Number(v)),
  z.number().int().min(1).max(8).optional(),
);
const optionalText = (max: number) => z.preprocess(emptyToUndef, z.string().trim().max(max).optional());

// Acepta "@usuario" o la URL del perfil y se queda con el usuario.
const instagram = z.preprocess(
  (v) => {
    const s = emptyToUndef(v);
    if (typeof s !== 'string') return s;
    return s.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  },
  z.string().regex(/^[A-Za-z0-9._]{1,30}$/).optional(),
);

export const playerInputSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  gender: z.enum(GENDERS),
  category,
  position: z.preprocess(emptyToUndef, z.enum(POSITIONS).optional()),
  slots: z.array(z.enum(SLOTS)).max(4).transform((s) => [...new Set(s)]),
  phone: z.string().trim().min(1).max(40),
  instagram,
  locality: optionalText(80),
  notes: optionalText(500),
});
export type PlayerInput = z.infer<typeof playerInputSchema>;

export const playerFiltersSchema = z.object({
  q: z.preprocess(emptyToUndef, z.string().trim().max(80).optional()),
  category,
  gender: z.preprocess(emptyToUndef, z.enum(GENDERS).optional()),
  position: z.preprocess(emptyToUndef, z.enum(POSITIONS).optional()),
  slot: z.preprocess(emptyToUndef, z.enum(SLOTS).optional()),
  page: z.preprocess((v) => Number.parseInt(String(v ?? '1'), 10) || 1, z.number().int().min(1).max(10_000)),
});
export type PlayerFilters = z.infer<typeof playerFiltersSchema>;
