"use client";

import { useEffect } from "react";
import "@/lib/install-prompt"; // captura `beforeinstallprompt` apenas hidrata el layout

// Registra el service worker solo en producción: en dev cachearía estáticos viejos y confundiría el HMR.
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
