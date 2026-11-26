import { Icon } from "@/components/icons";
import { ui } from "@/components/ui";

/** Lugar del cuadro que pasa libre: solo el nombre (o de qué puesto sale) en una píldora punteada. */
export function ByeSlot({ name, label }: { name: string; label: string }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2 rounded-lg border border-dashed border-line-strong bg-surface-raised px-3 py-1.5">
      <p className="min-w-0 truncate text-[13px] font-semibold" title={name}>{name}</p>
      <span className={ui.badge}>{label}</span>
    </div>
  );
}

/** Cartel del campeón, cuando la final ya tiene resultado. */
export function ChampionBanner({ label, name }: { label: string; name: string }) {
  return (
    <section className="enter flex items-center gap-4 rounded-lg bg-brand p-4 text-on-brand sm:p-5">
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-ball text-on-ball"><Icon name="crown" className="size-6" /></span>
      <div className="min-w-0">
        <p className="text-sm font-medium opacity-90">{label}</p>
        <p className="break-words font-display text-3xl font-bold leading-tight sm:text-4xl">{name}</p>
      </div>
    </section>
  );
}
