import { expect, it } from "vitest";
import type { Actor } from "@/shared/types/actor";
import {
  AdminCapability,
  hasCapability,
  requireCapability,
  resolveCapabilities,
} from "./capabilities";
import { ForbiddenError } from "@/shared/lib/errors";

const admin: Actor = { userId: "a", orgRole: "ADMIN", organizationId: "org-1" };
const member: Actor = { userId: "m", orgRole: "MEMBER", organizationId: "org-1" };

it("an org ADMIN holds every capability (V1 model)", () => {
  const caps = resolveCapabilities(admin);
  for (const cap of Object.values(AdminCapability)) {
    expect(caps.has(cap)).toBe(true);
  }
});

it("a MEMBER holds no admin capability", () => {
  expect(resolveCapabilities(member).size).toBe(0);
  expect(hasCapability(member, AdminCapability.VIEW_AUDIT_LOG)).toBe(false);
});

it("requireCapability passes for a holder and throws Forbidden otherwise", () => {
  expect(() =>
    requireCapability(admin, AdminCapability.MANAGE_FEATURE_FLAGS),
  ).not.toThrow();
  expect(() =>
    requireCapability(member, AdminCapability.MANAGE_FEATURE_FLAGS),
  ).toThrow(ForbiddenError);
});
