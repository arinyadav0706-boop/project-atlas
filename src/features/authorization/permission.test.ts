import { expect, it } from "vitest";
import type { Actor } from "@/shared/types/actor";
import { elevate, canWriteContent, canManageProject } from "./permission";

const admin: Actor = { userId: "a", orgRole: "ADMIN", organizationId: "org-1" };
const member: Actor = { userId: "m", orgRole: "MEMBER", organizationId: "org-1" };

it("elevates an org ADMIN to LEAD regardless of membership (ADR-0024)", () => {
  expect(elevate(admin, null)).toBe("LEAD");
  expect(elevate(admin, "VIEWER")).toBe("LEAD");
  expect(elevate(admin, "MEMBER")).toBe("LEAD");
});

it("leaves a non-admin's membership role untouched", () => {
  expect(elevate(member, null)).toBeNull();
  expect(elevate(member, "VIEWER")).toBe("VIEWER");
  expect(elevate(member, "MEMBER")).toBe("MEMBER");
  expect(elevate(member, "LEAD")).toBe("LEAD");
});

it("canWriteContent: MEMBER or LEAD", () => {
  expect(canWriteContent("VIEWER")).toBe(false);
  expect(canWriteContent(null)).toBe(false);
  expect(canWriteContent("MEMBER")).toBe(true);
  expect(canWriteContent("LEAD")).toBe(true);
});

it("canManageProject: LEAD only", () => {
  expect(canManageProject("MEMBER")).toBe(false);
  expect(canManageProject("LEAD")).toBe(true);
});

it("an elevated admin passes both predicates", () => {
  const role = elevate(admin, null);
  expect(canWriteContent(role)).toBe(true);
  expect(canManageProject(role)).toBe(true);
});
