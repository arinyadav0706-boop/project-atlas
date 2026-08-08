// Which classification chips survive a row's budget (ADR-0018, ADR-0026).
//
// Pure and separate from the component because this is the part that was wrong,
// and it is invisible from the markup: the chips were always "there", just the
// wrong ones. A rendering test would not have caught either defect.

export interface ChipRef {
  id: string;
  name: string;
}

export interface ChipSelection<L extends ChipRef, C extends ChipRef> {
  labels: L[];
  components: C[];
  /** Exactly what the "+N" stands for — never the visible chips too. */
  hidden: ChipRef[];
}

// Generic over the concrete chip types so callers keep their own fields — a
// label carries a `color` the renderer needs, and narrowing it to ChipRef here
// would quietly strip it.
export function selectChips<L extends ChipRef, C extends ChipRef>(
  input: {
    epicKey?: string | null;
    labels?: readonly L[] | null;
    components?: readonly C[] | null;
  },
  options: { max?: number; showComponents?: boolean } = {},
): ChipSelection<L, C> {
  const { max, showComponents = true } = options;
  const labels = input.labels ?? [];
  // Suppressed components are dropped, not collapsed — a hidden component must
  // not inflate the "+N", or a row with no labels would read "+2" and expand to
  // nothing the reader can act on.
  const components = showComponents ? (input.components ?? []) : [];

  const total = labels.length + components.length;
  // The epic badge spends a slot. It didn't, so `max: 3` rendered four chips
  // plus a "+N" — five objects competing with the title.
  const budget = max === undefined ? total : Math.max(max - (input.epicKey ? 1 : 0), 0);

  // Labels outrank components deliberately. Components are stable org taxonomy
  // ("Authentication", "Reporting") and largely inferable from the title;
  // labels are the volatile cross-cutting signal people actually filter on
  // ("tech-debt", "regression"). Slicing components first meant an issue with
  // three components showed zero labels — the two least informative chips won
  // the row every time.
  const shownLabels = labels.slice(0, budget);
  const shownComponents = components.slice(0, Math.max(budget - shownLabels.length, 0));

  return {
    labels: [...shownLabels],
    components: [...shownComponents],
    hidden: [...labels.slice(shownLabels.length), ...components.slice(shownComponents.length)],
  };
}
