import { Icon } from "./icons";
import { cx } from "./ui";

/** Corona en una medalla amarilla pelota: marca a la pareja ganadora de un partido (con nombre accesible, no solo color). */
export function WinnerMark({ label, className }: { label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} title={label} className={cx("inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-ball text-on-ball ring-1 ring-on-ball/20", className)}>
      <Icon name="crown" className="size-3" />
    </span>
  );
}
