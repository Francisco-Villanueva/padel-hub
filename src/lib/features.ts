// Funciones que el superadmin habilita club por club (tabla club_features). Apagadas por defecto.
export const FEATURES = ['tournaments'] as const;
export type Feature = (typeof FEATURES)[number];
export const isFeature = (v: unknown): v is Feature => (FEATURES as readonly unknown[]).includes(v);
