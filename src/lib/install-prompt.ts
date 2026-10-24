// Estado de "instalar app" compartido entre componentes de cliente.
// Chrome/Edge/Android avisan con `beforeinstallprompt` (una sola vez, temprano); iOS Safari no tiene API y se instala a mano desde Compartir.
// `SwRegister` importa este módulo desde el layout para capturar el evento aunque el botón (en el panel) hidrate más tarde.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export type InstallMode = "native" | "ios" | "none";

let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export function getInstallMode(): InstallMode {
  if (installed || isStandalone()) return "none";
  if (deferred) return "native";
  return isIos() ? "ios" : "none";
}

export const subscribeInstall = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/** Lanza el diálogo nativo de instalación. Devuelve false si no hay evento (iOS): ahí se muestran las instrucciones. */
export async function promptInstall(): Promise<boolean> {
  const ev = deferred;
  if (!ev) return false;
  deferred = null;
  emit();
  await ev.prompt();
  await ev.userChoice;
  return true;
}
