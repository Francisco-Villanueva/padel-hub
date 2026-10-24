export type NavIcon = "home" | "players" | "cuarto" | "settings" | "clubs";

/** Ítem de navegación serializable (server → client). `label` es una clave del namespace `nav`. */
export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Activo solo en la ruta exacta (para el inicio, que es prefijo de todas las demás). */
  exact?: boolean;
}
