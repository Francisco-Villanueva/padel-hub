/* eslint-disable @next/next/no-img-element -- logos ya reducidos y SVG de marca estáticos */

type PosterText = {
  eyebrow: string;
  headlineA: string;
  headlineB: string;
  lead: string;
  qrLabel: string;
  madeBy: string;
};

/** El cartel se imprime siempre con la marca clara, aunque el panel esté en modo oscuro: fija los tokens acá. */
const LIGHT = {
  "--surface": "#f5f7f4",
  "--surface-raised": "#ffffff",
  "--ink": "#10201b",
  "--ink-muted": "#4a5b55",
  "--line": "#cfd9d3",
  "--brand": "#0b6b4f",
  "--on-brand": "#ffffff",
  "--ball": "#d7f23a",
} as React.CSSProperties;

/**
 * Cartel A5 vertical (148×210 mm). Todas las medidas van en `cqw` (1% del ancho del cartel), así se ve igual
 * en celular, escritorio y papel. Estructura: club (logo + nombre), titular, QR sobre cancha y pie de PadelHub.
 */
export function Poster({ clubName, logoUrl, qrSvg, text }: { clubName: string; logoUrl: string | null; qrSvg: string; text: PosterText }) {
  return (
    <div
      className="print-poster mx-auto w-full"
      style={{ ...LIGHT, containerType: "inline-size", aspectRatio: "148 / 210", background: "var(--surface)", color: "var(--ink)" }}
    >
      <div className="flex h-full flex-col" style={{ padding: "7.5cqw 8cqw 6cqw", gap: "4.5cqw" }}>
        <div className="flex items-center" style={{ gap: "4cqw" }}>
          <div
            className="flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-black/10"
            style={{ width: "16cqw", height: "16cqw", borderRadius: "2.6cqw" }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="size-full object-contain" style={{ padding: "1.2cqw" }} />
            ) : (
              <span aria-hidden className="font-display font-bold" style={{ fontSize: "7cqw", color: "var(--brand)" }}>
                {clubName.trim().slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold uppercase" style={{ fontSize: "2.4cqw", letterSpacing: "0.12em", color: "var(--brand)" }}>{text.eyebrow}</p>
            <p className="font-display font-bold leading-none break-words" style={{ fontSize: "9cqw", marginTop: "1cqw" }}>{clubName}</p>
          </div>
        </div>

        <div>
          <h3 className="font-display font-bold" style={{ fontSize: "11.5cqw", lineHeight: 0.95, letterSpacing: "-0.01em" }}>
            {text.headlineA} <span style={{ color: "var(--brand)" }}>{text.headlineB}</span>
          </h3>
          <p style={{ fontSize: "3.4cqw", lineHeight: 1.4, color: "var(--ink-muted)", marginTop: "2cqw" }}>{text.lead}</p>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden" style={{ background: "var(--brand)", borderRadius: "3cqw" }}>
          {/* Cancha: líneas en % del panel, así no se deforman con su alto. */}
          <div aria-hidden className="absolute" style={{ inset: "4cqw", border: "0.5cqw solid var(--ball)" }} />
          <div aria-hidden className="absolute" style={{ top: "4cqw", bottom: "4cqw", left: "50%", borderLeft: "0.5cqw solid var(--ball)" }} />
          <div aria-hidden className="absolute" style={{ top: "4cqw", bottom: "4cqw", left: "22%", borderLeft: "0.5cqw solid var(--ball)" }} />
          <div aria-hidden className="absolute" style={{ top: "4cqw", bottom: "4cqw", right: "22%", borderLeft: "0.5cqw solid var(--ball)" }} />
          <div aria-hidden className="absolute" style={{ top: "50%", left: "22%", right: "22%", borderTop: "0.5cqw solid var(--ball)" }} />
          {/* QR: siempre tinta sobre blanco, con margen libre de más de 4 módulos. */}
          <div
            role="img"
            aria-label={text.qrLabel}
            className="relative flex items-center justify-center bg-white [&>svg]:size-full [&>svg]:block"
            style={{ width: "42cqw", height: "42cqw", padding: "4.6cqw", borderRadius: "3cqw", boxShadow: "0 1.4cqw 4cqw -0.6cqw rgba(16,32,27,0.35)" }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        </div>

        <div className="flex items-center justify-between">
          <img src="/brand/logo-horizontal.svg" alt="PadelHub" style={{ height: "4.6cqw", width: "auto" }} />
          <span style={{ fontSize: "2.1cqw", color: "var(--ink-muted)" }}>{text.madeBy}</span>
        </div>
      </div>
    </div>
  );
}
