// Fecha y hora "de pared" del club <-> instante UTC, según la zona horaria del club (clubs.timezone).
// Los horarios de los partidos se cargan como día + hora locales ("sábado 15:00") y se guardan como timestamptz.

/** Desfase (ms) de la zona `tz` respecto de UTC en el instante `ts`. */
function offsetMs(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts));
  const v = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second')) - Math.floor(ts / 1000) * 1000;
}

/** "2026-11-20" + "15:30" en `tz` → instante UTC. null si la fecha u hora no son válidas. */
export function localToUtc(date: string, time: string, tz: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  if (new Date(wall).getUTCDate() !== da) return null; // 31 de febrero, etc.
  // Dos pasadas: el desfase puede cambiar si el instante cae al otro lado de un cambio de horario.
  let ts = wall - offsetMs(wall, tz);
  ts = wall - offsetMs(ts, tz);
  return new Date(ts);
}

/** Instante UTC → { date: "2026-11-20", time: "15:30" } en `tz` (para precargar los campos del formulario). */
export function utcToLocalInputs(at: Date, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
  const v = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${v('year')}-${v('month')}-${v('day')}`, time: `${v('hour')}:${v('minute')}` };
}
