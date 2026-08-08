import { describe, expect, it } from "vitest";
import { selectChips } from "./select-chips";

// The rule this file exists for.
//
// The Issues list shipped with a 3-chip cap that rendered five objects, and
// spent its budget on the least informative ones: components were sliced first,
// so an issue with three components showed none of its labels. Both defects
// were invisible in the markup and in every existing test — the chips were
// "there", just the wrong ones.

const label = (name: string) => ({ id: `l-${name}`, name });
const component = (name: string) => ({ id: `c-${name}`, name });

describe("selectChips", () => {
  it("spends the budget on labels before components", () => {
    const result = selectChips(
      {
        labels: [label("tech-debt"), label("regression")],
        components: [component("Authentication"), component("Reporting")],
      },
      { max: 2 },
    );

    expect(result.labels.map((l) => l.name)).toEqual(["tech-debt", "regression"]);
    expect(result.components).toEqual([]);
    expect(result.hidden.map((c) => c.name)).toEqual(["Authentication", "Reporting"]);
  });

  it("still shows components once labels are exhausted", () => {
    const result = selectChips(
      { labels: [label("tech-debt")], components: [component("Authentication")] },
      { max: 2 },
    );

    expect(result.labels.map((l) => l.name)).toEqual(["tech-debt"]);
    expect(result.components.map((c) => c.name)).toEqual(["Authentication"]);
    expect(result.hidden).toEqual([]);
  });

  it("counts the epic badge against the cap", () => {
    // The row renders the epic too, so max:3 must mean three objects total.
    const result = selectChips(
      { epicKey: "VWP-21", labels: [label("a"), label("b"), label("c")] },
      { max: 3 },
    );

    expect(result.labels).toHaveLength(2);
    expect(result.hidden).toHaveLength(1);
  });

  it("drops components entirely when the surface asks it to", () => {
    const result = selectChips(
      { labels: [label("tech-debt")], components: [component("Authentication")] },
      { max: 3, showComponents: false },
    );

    expect(result.components).toEqual([]);
    // Suppressed, not collapsed — a hidden component must not inflate the "+N",
    // or a row with no labels would read "+2" and expand to nothing new.
    expect(result.hidden).toEqual([]);
  });

  it("reports only the hidden chips, not every chip", () => {
    const result = selectChips(
      { labels: [label("a"), label("b"), label("c"), label("d")] },
      { max: 2 },
    );

    expect(result.hidden.map((c) => c.name)).toEqual(["c", "d"]);
  });

  it("keeps everything when no cap is given", () => {
    const result = selectChips({
      labels: [label("a"), label("b")],
      components: [component("X")],
    });

    expect(result.labels).toHaveLength(2);
    expect(result.components).toHaveLength(1);
    expect(result.hidden).toEqual([]);
  });

  it("survives an issue with no classification at all", () => {
    expect(selectChips({}, { max: 3 })).toEqual({ labels: [], components: [], hidden: [] });
  });
});
