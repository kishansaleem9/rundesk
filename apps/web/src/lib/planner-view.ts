/**
 * §V2-S14c frame `13:50` — which span the Planner is showing.
 *
 * The frame's selector offers **Day (d) · 4 days (x) · Week (w) · Month (m)**
 * with those single-key shortcuts, and a **Show weekends** toggle beside them.
 * The Planner drew a seven-day week and nothing else: `Array.from({length: 7})`,
 * with the prev/next arrows hardcoded to ±7 days.
 *
 * WHY THIS IS A MODULE. The span decides three things that have to agree — the
 * days drawn, how far an arrow moves, and which layout is used — and getting
 * them from one place is what stops "next" moving a week while the grid shows a
 * month. It is also the only way to test the date arithmetic without a browser,
 * and date arithmetic is where off-by-one lives.
 */
export type PlannerView = 'day' | 'four' | 'week' | 'month'

export const PLANNER_VIEWS: readonly PlannerView[] = ['day', 'four', 'week', 'month'] as const

/** The frame's shortcuts, exactly: `d x w m`. */
export const PLANNER_VIEW_KEYS: Record<string, PlannerView> = {
  d: 'day',
  x: 'four',
  w: 'week',
  m: 'month',
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const addDays = (d: Date, n: number) => {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function startOfWeek(d: Date, weekStartsOn: number) {
  const out = startOfDay(d)
  out.setDate(out.getDate() - ((out.getDay() - weekStartsOn + 7) % 7))
  return out
}

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6

/**
 * The days the grid should draw.
 *
 * `showWeekends` is honoured for **week** and **month** only. On Day or 4 days
 * the person navigated to a specific span, and dropping the Saturday they asked
 * for would leave them looking at an empty grid wondering what broke.
 */
export function plannerRange(
  view: PlannerView,
  anchor: Date,
  weekStartsOn: number,
  showWeekends: boolean,
): Date[] {
  if (view === 'day') return [startOfDay(anchor)]
  if (view === 'four') return Array.from({ length: 4 }, (_, i) => addDays(startOfDay(anchor), i))
  if (view === 'week') {
    const from = startOfWeek(anchor, weekStartsOn)
    const all = Array.from({ length: 7 }, (_, i) => addDays(from, i))
    return showWeekends ? all : all.filter((d) => !isWeekend(d))
  }
  // Month: the calendar month the anchor falls in, first to last.
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const days: Date[] = []
  for (let d = new Date(first); d.getMonth() === first.getMonth(); d = addDays(d, 1)) {
    if (showWeekends || !isWeekend(d)) days.push(new Date(d))
  }
  return days
}

/**
 * Where an arrow lands.
 *
 * One span per press, which is the only stepping that does not skip or repeat
 * days: a Month view stepping seven days would show the same fortnight twice.
 */
export function plannerStep(view: PlannerView, anchor: Date, direction: 1 | -1): Date {
  if (view === 'month') {
    // The 1st, so stepping out of a 31-day month into a 30-day one cannot
    // land on a date that does not exist and silently skip a month.
    return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1)
  }
  const span = view === 'day' ? 1 : view === 'four' ? 4 : 7
  return addDays(anchor, span * direction)
}

const VIEW_KEY = 'rundesk.plannerView'

export function readPlannerView(): PlannerView {
  try {
    const raw = window.localStorage.getItem(VIEW_KEY)
    return (PLANNER_VIEWS as readonly string[]).includes(raw ?? '')
      ? (raw as PlannerView)
      : 'week'
  } catch {
    // Blocked site data throws rather than returning null; the week is the
    // default the Planner has always opened on.
    return 'week'
  }
}

export function writePlannerView(view: PlannerView): void {
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {
    // A span that is not remembered for next time still works for this one.
  }
}
