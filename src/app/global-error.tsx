"use client";

// Último recurso: reemplaza al layout raíz, así que trae su propio <html> y no puede usar next-intl ni las
// clases de la app. Mensaje en los tres idiomas y estilos mínimos que respetan el modo oscuro del sistema.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  void error;
  return (
    <html lang="es">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", colorScheme: "light dark", textAlign: "center", padding: "2rem" }}>
        <div role="alert">
          <h1 style={{ fontSize: "1.5rem" }}>Algo salió mal · Something went wrong · Algo deu errado</h1>
          <button type="button" onClick={() => retry()} style={{ marginTop: "1rem", minHeight: 44, padding: "0 1.25rem", fontSize: "1rem", cursor: "pointer" }}>
            Reintentar · Try again · Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
