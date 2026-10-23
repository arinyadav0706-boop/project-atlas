import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps a type token next to a text colour", () => {
    // The regression: these were read as two colours and the size was dropped.
    expect(cn("text-meta", "text-muted-foreground")).toBe(
      "text-meta text-muted-foreground",
    );
    expect(cn("text-body text-foreground", "text-destructive")).toBe(
      "text-body text-destructive",
    );
  });

  it("still lets a later type token replace an earlier one", () => {
    expect(cn("text-body", "text-meta")).toBe("text-meta");
    expect(cn("text-sm", "text-micro")).toBe("text-micro");
  });
});
