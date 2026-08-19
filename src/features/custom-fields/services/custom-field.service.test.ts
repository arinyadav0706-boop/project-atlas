import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, ValidationError } from "@/shared/lib/errors";
import { CustomFieldService } from "@/features/custom-fields/services/custom-field.service";
import { CustomFieldRepository } from "@/features/custom-fields/repositories/custom-field.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/custom-fields/repositories/custom-field.repository", () => ({
  CustomFieldRepository: {
    listDefinitions: vi.fn(),
    findDefinition: vi.fn(),
    findByName: vi.fn(),
    createDefinition: vi.fn(),
    updateDefinition: vi.fn(),
    softDeleteDefinition: vi.fn(),
    listForProject: vi.fn(),
    setForProject: vi.fn(),
    valuesForIssue: vi.fn(),
    usersByIds: vi.fn(),
    applyValues: vi.fn(),
  },
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { getContext: vi.fn(), getMemberRole: vi.fn() },
}));
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));

const repo = vi.mocked(CustomFieldRepository);
const projects = vi.mocked(ProjectService);
const audit = vi.mocked(AuditLogService);

const admin = { userId: "u-admin", organizationId: "org-1", orgRole: "ADMIN" } as Actor;
const member = { userId: "u-member", organizationId: "org-1", orgRole: "MEMBER" } as Actor;

function def(over: Record<string, unknown> = {}) {
  return {
    id: "f1",
    name: "Customer",
    type: "TEXT",
    description: null,
    required: false,
    options: [],
    _count: { projects: 0 },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.findByName.mockResolvedValue(null as never);
  repo.listDefinitions.mockResolvedValue([] as never);
  repo.listForProject.mockResolvedValue([] as never);
  repo.valuesForIssue.mockResolvedValue([] as never);
  repo.usersByIds.mockResolvedValue([] as never);
  repo.applyValues.mockResolvedValue([] as never);
  projects.getContext.mockResolvedValue({
    id: "p1",
    organizationId: "org-1",
    status: "ACTIVE",
  } as never);
  projects.getMemberRole.mockResolvedValue("LEAD" as never);
});

// BR-4: defining a field is an ORG capability, distinct from using one.
describe("definition authority", () => {
  it("refuses a non-admin listing the library", async () => {
    await expect(CustomFieldService.list(member)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a non-admin creating a field", async () => {
    await expect(
      CustomFieldService.create(member, {
        name: "X",
        type: "TEXT",
        required: false,
        options: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a duplicate name case-insensitively (BR-1)", async () => {
    repo.findByName.mockResolvedValue({ id: "other" } as never);
    await expect(
      CustomFieldService.create(admin, {
        name: "customer",
        type: "TEXT",
        required: false,
        options: [],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("audits a creation", async () => {
    repo.createDefinition.mockResolvedValue(def() as never);
    await CustomFieldService.create(admin, {
      name: "Customer",
      type: "TEXT",
      required: false,
      options: [],
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CUSTOM_FIELD_CREATED" }),
    );
  });
});

describe("options belong to select types only", () => {
  it("refuses a SELECT with no options — an unusable control", async () => {
    await expect(
      CustomFieldService.create(admin, {
        name: "Tier",
        type: "SELECT",
        required: false,
        options: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses options on a TEXT field", async () => {
    await expect(
      CustomFieldService.create(admin, {
        name: "Note",
        type: "TEXT",
        required: false,
        options: [{ label: "a" }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("deleting keeps history (BR-12)", () => {
  it("soft-deletes and never touches the value rows", async () => {
    repo.findDefinition.mockResolvedValue(def() as never);
    repo.softDeleteDefinition.mockResolvedValue([] as never);
    await CustomFieldService.remove(admin, "f1");
    expect(repo.softDeleteDefinition).toHaveBeenCalledWith("f1", "u-admin");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CUSTOM_FIELD_DELETED" }),
    );
  });
});

// BR-6: enabling on a project is a project-LEAD action, NOT the org capability.
describe("project enablement", () => {
  it("lets a project lead who is not an org admin enable fields", async () => {
    repo.listDefinitions.mockResolvedValue([def()] as never);
    repo.setForProject.mockResolvedValue([] as never);
    await expect(
      CustomFieldService.setForProject(member, "p1", { fieldIds: ["f1"] }),
    ).resolves.toBeTruthy();
  });

  it("refuses a plain member", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER" as never);
    await expect(
      CustomFieldService.setForProject(member, "p1", { fieldIds: [] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a field id from outside the org", async () => {
    repo.listDefinitions.mockResolvedValue([def()] as never);
    await expect(
      CustomFieldService.setForProject(member, "p1", { fieldIds: ["other-orgs-field"] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("stores the payload order as the display order", async () => {
    repo.listDefinitions.mockResolvedValue([def(), def({ id: "f2", name: "B" })] as never);
    repo.setForProject.mockResolvedValue([] as never);
    await CustomFieldService.setForProject(member, "p1", { fieldIds: ["f2", "f1"] });
    expect(repo.setForProject).toHaveBeenCalledWith("p1", ["f2", "f1"]);
  });
});

describe("setting values", () => {
  const enabled = (over: Record<string, unknown> = {}) => [
    { position: 0, field: def(over) },
  ];

  it("refuses a VIEWER (BR-8)", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER" as never);
    repo.listForProject.mockResolvedValue(enabled() as never);
    await expect(
      CustomFieldService.setForIssue(member, { id: "i1", projectId: "p1" }, {
        values: { f1: "x" },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses writes in an archived project", async () => {
    projects.getContext.mockResolvedValue({
      id: "p1",
      organizationId: "org-1",
      status: "ARCHIVED",
    } as never);
    repo.listForProject.mockResolvedValue(enabled() as never);
    await expect(
      CustomFieldService.setForIssue(member, { id: "i1", projectId: "p1" }, {
        values: { f1: "x" },
      }),
    ).rejects.toThrow();
  });

  it("rejects a field that is not enabled here, rather than ignoring it", async () => {
    repo.listForProject.mockResolvedValue([] as never);
    // Silently dropping would make the form report success and lose the value.
    await expect(
      CustomFieldService.setForIssue(member, { id: "i1", projectId: "p1" }, {
        values: { f1: "x" },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects the whole batch when one value is invalid", async () => {
    repo.listForProject.mockResolvedValue([
      { position: 0, field: def({ id: "f1", type: "TEXT" }) },
      { position: 1, field: def({ id: "f2", name: "Count", type: "NUMBER" }) },
    ] as never);
    await expect(
      CustomFieldService.setForIssue(member, { id: "i1", projectId: "p1" }, {
        values: { f1: "fine", f2: "not a number" },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.applyValues).not.toHaveBeenCalled();
  });

  it("names the field in the error, so the message is actionable", async () => {
    repo.listForProject.mockResolvedValue([
      { position: 0, field: def({ id: "f2", name: "Contract value", type: "NUMBER" }) },
    ] as never);
    await expect(
      CustomFieldService.setForIssue(member, { id: "i1", projectId: "p1" }, {
        values: { f2: "abc" },
      }),
    ).rejects.toThrow(/Contract value/);
  });

  it("requires a USER value to be a member of this project", async () => {
    repo.listForProject.mockResolvedValue([
      { position: 0, field: def({ id: "f3", name: "Owner", type: "USER" }) },
    ] as never);
    projects.getMemberRole.mockImplementation(((_p: string, userId: string) =>
      Promise.resolve(userId === "u-member" ? "LEAD" : null)) as never);
    await expect(
      CustomFieldService.setForIssue(member, { id: "i1", projectId: "p1" }, {
        values: { f3: "outsider" },
      }),
    ).rejects.toThrow(/member of this project/);
  });

  it("routes an emptied value to a clear, not a stored blank (BR-10)", async () => {
    repo.listForProject.mockResolvedValue(enabled() as never);
    await CustomFieldService.setForIssue(member, { id: "i1", projectId: "p1" }, {
      values: { f1: "" },
    });
    expect(repo.applyValues).toHaveBeenCalledWith("i1", [], ["f1"], "u-member");
  });
});

// BR-11 / ADR-0042 §4 — required blocks creation, never edits.
describe("required fields", () => {
  beforeEach(() => {
    repo.listForProject.mockResolvedValue([
      { position: 0, field: def({ id: "f1", name: "Customer", required: true }) },
    ] as never);
  });

  it("reports a missing required field on create", async () => {
    expect(await CustomFieldService.missingRequired("p1", {})).toEqual(["Customer"]);
  });

  it("treats an empty string and an empty array as missing", async () => {
    expect(await CustomFieldService.missingRequired("p1", { f1: "" })).toEqual(["Customer"]);
    expect(await CustomFieldService.missingRequired("p1", { f1: [] })).toEqual(["Customer"]);
  });

  it("is satisfied by a value", async () => {
    expect(await CustomFieldService.missingRequired("p1", { f1: "Acme" })).toEqual([]);
  });

  it("ignores fields that are not required", async () => {
    repo.listForProject.mockResolvedValue([
      { position: 0, field: def({ required: false }) },
    ] as never);
    expect(await CustomFieldService.missingRequired("p1", {})).toEqual([]);
  });
});

// BR-14: a retired field's value is kept but not shown.
describe("reading values for an issue", () => {
  it("returns only fields the project currently enables, in its order", async () => {
    repo.listForProject.mockResolvedValue([
      { position: 0, field: def({ id: "f2", name: "Second" }) },
      { position: 1, field: def({ id: "f1", name: "First" }) },
    ] as never);
    repo.valuesForIssue.mockResolvedValue([
      { fieldId: "f1", valueText: "a", valueNumber: null, valueDate: null, valueBool: null, valueUserId: null, optionIds: [] },
      { fieldId: "gone", valueText: "orphan", valueNumber: null, valueDate: null, valueBool: null, valueUserId: null, optionIds: [] },
    ] as never);

    const result = await CustomFieldService.forIssue("p1", "i1");
    expect(result.map((f) => f.fieldId)).toEqual(["f2", "f1"]);
    expect(result.find((f) => f.fieldId === "f1")?.value).toBe("a");
  });

  it("returns nothing when the project enables no fields", async () => {
    repo.listForProject.mockResolvedValue([] as never);
    expect(await CustomFieldService.forIssue("p1", "i1")).toEqual([]);
  });
});
