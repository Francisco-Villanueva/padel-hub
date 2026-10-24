"use client";

import { ErrorView } from "@/components/error-view";

// Error dentro del panel del club: la barra lateral y la navegación quedan en pantalla.
export default function ClubError(props: { error: unknown; retry: () => void }) {
  return <ErrorView {...props} />;
}
