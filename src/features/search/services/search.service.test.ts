import { beforeEach, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/search/repositories/search.repository", () => ({
  SearchRepository: {
    searchIssues: vi.fn(),
    searchProjects: vi.fn(),
  },
}));

import { SearchRepository } from "@/features/search/repositories/search.repository";
import { SearchService } from "./search.service";

const repo = vi.mocked(SearchRepository);
const actor: Actor = { userId: "u-1", orgRole: "MEMBER", organizationId: "org-1" };

beforeEach(() => {
  vi.resetAllMocks();
  repo.searchIssues.mockResolvedValue([]);
  repo.searchProjects.mockResolvedValue([]);
});

it("short-circuits a query shorter than 2 chars without hitting the repository (BR-5)", async () => {
  const result = await SearchService.search(actor, "a");
  expect(result).toEqual({ issues: [], projects: [] });
  expect(repo.searchIssues).not.toHaveBeenCalled();
  expect(repo.searchProjects).not.toHaveBeenCalled();
});

it("treats a whitespace-only query as empty", async () => {
  await SearchService.search(actor, "   ");
  expect(repo.searchIssues).not.toHaveBeenCalled();
});

it("scopes the query to the caller's organization (F-1)", async () => {
  await SearchService.search(actor, "login");
  expect(repo.searchIssues).toHaveBeenCalledWith("org-1", "login", expect.any(Number));
  expect(repo.searchProjects).toHaveBeenCalledWith("org-1", "login", expect.any(Number));
});

it("trims the query before searching", async () => {
  await SearchService.search(actor, "  redirect  ");
  expect(repo.searchIssues).toHaveBeenCalledWith("org-1", "redirect", expect.any(Number));
});

it("maps issue rows to hrefs built from projectId + issue id", async () => {
  repo.searchIssues.mockResolvedValue([
    { id: "i-1", key: "ENG-12", title: "Fix login", projectId: "p-9", projectKey: "ENG" },
  ]);
  const result = await SearchService.search(actor, "login");
  expect(result.issues[0]).toEqual({
    id: "i-1",
    key: "ENG-12",
    title: "Fix login",
    projectKey: "ENG",
    href: "/projects/p-9/issues/i-1",
  });
});

it("maps project rows to their issues-tab href", async () => {
  repo.searchProjects.mockResolvedValue([{ id: "p-9", key: "ENG", name: "Engineering" }]);
  const result = await SearchService.search(actor, "eng");
  expect(result.projects[0]).toEqual({
    id: "p-9",
    key: "ENG",
    name: "Engineering",
    href: "/projects/p-9/issues",
  });
});
