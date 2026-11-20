// Validación compartida (formularios y servidor) de los ajustes del club y de las altas del superadmin.
import { z } from 'zod';

export const CLUB_LOCALES = ['es', 'en', 'pt'] as const;
/** Zonas horarias que ofrece la interfaz (los países donde se espera operar). */
export const TIMEZONES = [
  'America/Argentina/Buenos_Aires', 'America/Santiago', 'America/Montevideo', 'America/Asuncion', 'America/Bogota',
  'America/Lima', 'America/Mexico_City', 'America/Sao_Paulo', 'Europe/Madrid', 'America/New_York',
] as const;
export const COUNTRIES = ['AR', 'CL', 'UY', 'PY', 'CO', 'PE', 'MX', 'BR', 'ES', 'US'] as const;

const emptyToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const hex = z.preprocess(emptyToUndef, z.string().regex(/^#[0-9a-fA-F]{6}$/).optional());

export const brandSchema = z.object({
  name: z.string().trim().min(2).max(80),
  colorPrimary: hex,
  colorAccent: hex,
  locale: z.enum(CLUB_LOCALES),
  timezone: z.enum(TIMEZONES),
  contactEmail: z.preprocess(emptyToUndef, z.string().trim().max(254).email().optional()),
});
export type BrandInput = z.infer<typeof brandSchema>;

export const newStaffSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().max(254).email(),
  password: z.string().min(10).max(200),
});
export type NewStaffInput = z.infer<typeof newStaffSchema>;

export const newClubSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/),
  name: z.string().trim().min(2).max(80),
  country: z.enum(COUNTRIES),
  locale: z.enum(CLUB_LOCALES),
  timezone: z.enum(TIMEZONES),
  ownerName: z.string().trim().min(2).max(80),
  ownerEmail: z.string().trim().toLowerCase().max(254).email(),
  ownerPassword: z.string().min(10).max(200),
});
export type NewClubInput = z.infer<typeof newClubSchema>;

/** Zona horaria por defecto de cada país (el dueño la puede cambiar después en Ajustes). */
export const COUNTRY_TIMEZONE: Record<(typeof COUNTRIES)[number], (typeof TIMEZONES)[number]> = {
  AR: 'America/Argentina/Buenos_Aires', CL: 'America/Santiago', UY: 'America/Montevideo', PY: 'America/Asuncion',
  CO: 'America/Bogota', PE: 'America/Lima', MX: 'America/Mexico_City', BR: 'America/Sao_Paulo', ES: 'Europe/Madrid', US: 'America/New_York',
};

/** Slug sugerido a partir del nombre del club: minúsculas, sin tildes, guiones. */
export function slugify(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

// Alta pública de un club (autoservicio). Sin zona horaria: sale del país. El idioma sale de la URL.
export const registerClubSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/),
  country: z.enum(COUNTRIES),
  ownerName: z.string().trim().min(2).max(80),
  ownerEmail: z.string().trim().toLowerCase().max(254).email(),
  ownerPassword: z.string().min(10).max(200),
  locale: z.enum(CLUB_LOCALES).default('es'),
});
export type RegisterClubInput = z.infer<typeof registerClubSchema>;
