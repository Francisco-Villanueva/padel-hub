import { cx, stagger } from "@/components/ui";

export interface TreeMatch { id: string; round: number; position: number; status: string }

/**
 * Cuadro de cruces como árbol: una columna por ronda y cada cruce centrado entre los dos que lo alimentan, unidos con líneas.
 * Se ve de un vistazo quién se cruza con quién y por dónde sigue cada pareja.
 *
 * Es una grilla: cada partido de la primera ronda ocupa una fila y uno de la ronda r ocupa 2^(r-1) filas, así queda justo en
 * el medio de sus dos orígenes. Las columnas se reparten el ancho disponible (mínimo `minCol`) y, si no entran, el cuadro
 * se desplaza en horizontal. Las líneas son bordes de elementos absolutos que nacen en la mitad del hueco entre columnas.
 */
export function BracketTree<T extends TreeMatch>({
  rounds, matches, roundTitle, render, rowHeight = "7.5rem", minCol = "13rem", label,
}: {
  rounds: number; matches: T[]; roundTitle: (round: number) => string; render: (m: T) => React.ReactNode;
  rowHeight?: string; minCol?: string; label: string;
}) {
  const rows = 2 ** (rounds - 1);
  const GAP = "2rem"; // hueco entre columnas; las líneas llegan a la mitad (1rem)
  const line = "bg-line-strong";
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0" role="group" aria-label={label}>
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${rounds}, minmax(${minCol}, 1fr))`, gridTemplateRows: `auto repeat(${rows}, ${rowHeight})`, columnGap: GAP }}
      >
        {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
          <h2 key={r} className="px-1 pb-3 text-base font-bold" style={{ gridColumn: r, gridRow: 1 }}>{roundTitle(r)}</h2>
        ))}
        {matches.map((m, i) => {
          const span = 2 ** (m.round - 1);
          const top = m.position % 2 === 0; // los cruces se juntan de a dos: el de arriba baja, el de abajo sube
          const last = m.round === rounds;
          const done = m.status === "jugado" || m.status === "bye";
          return (
            <div
              key={m.id}
              className="enter relative flex items-center"
              style={{ gridColumn: m.round, gridRow: `${2 + m.position * span} / span ${span}`, ...stagger(i) }}
            >
              <div className="w-full">{render(m)}</div>
              {m.round > 1 && <span aria-hidden className={cx("absolute right-full top-1/2 h-px", line)} style={{ width: `calc(${GAP} / 2)` }} />}
              {!last && (
                <>
                  <span aria-hidden className={cx("absolute left-full top-1/2 h-px", done ? "bg-brand" : line)} style={{ width: `calc(${GAP} / 2)` }} />
                  <span
                    aria-hidden
                    className={cx("absolute w-px", line)}
                    style={{ left: `calc(100% + ${GAP} / 2)`, ...(top ? { top: "50%", bottom: 0 } : { top: 0, bottom: "50%" }) }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
