import { CATEGORIES } from '@/lib/player-schema';

type T = (key: string, values?: Record<string, string | number>) => string;

/** "7ma" / "Cat. 7" / "7ª": la categoría es solo el nivel; hombre o mujer lo da el género del jugador. */
export function categoryLabel(t: T, level: number): string {
  return t('category.name', { level: String(level) });
}

/** Opciones para los selectores: del 1 al 8 (el valor viaja como texto). */
export function categoryOptions(t: T): { id: string; label: string }[] {
  return CATEGORIES.map((n) => ({ id: String(n), label: categoryLabel(t, n) }));
}
