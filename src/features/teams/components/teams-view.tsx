"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, ChevronRight, Search, Users, Shield, UserPlus } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import { usePagination } from "@/shared/hooks/use-pagination";
import type { TeamDetailDto, TeamListItemDto } from "@/features/teams/types/team.types";

type UserOption = { id: string; name: string; email: string };
const NONE = "__none__";

export function TeamsView({
  teams,
  users,
}: {
  teams: TeamListItemDto[];
  users: UserOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState<string>(NONE);
  const [parentId, setParentId] = useState<string>(NONE);
  const [busy, setBusy] = useState(false);

  // Search filtering
  const filteredTeams = useMemo(() => {
    if (!query.trim()) return teams;
    const q = query.toLowerCase().trim();
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.manager && t.manager.name.toLowerCase().includes(q))
    );
  }, [teams, query]);

  // Integrated pagination
  const {
    paginatedItems,
    paginationProps,
  } = usePagination({
    items: filteredTeams,
    initialPageSize: 10,
    itemLabel: "teams",
    resetDeps: [query],
  });

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await apiRequest("/api/admin/teams", {
        method: "POST",
        body: {
          name: name.trim(),
          managerId: managerId === NONE ? null : managerId,
          parentTeamId: parentId === NONE ? null : parentId,
        },
      });
      toast.success("Team created");
      setName("");
      setManagerId(NONE);
      setParentId(NONE);
      setCreating(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the team.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header and Control Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams or managers…"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Button size="sm" onClick={() => setCreating((v) => !v)} className="gap-1.5 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" />
          New team
        </Button>
      </div>

      {creating && (
        <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-2xs sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="team-name" className="text-xs">Team Name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Platform Engineering"
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Team Manager</Label>
            <div className="mt-1">
              <UserSelect users={users} value={managerId} onChange={setManagerId} placeholder="No manager" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Parent Team (Optional)</Label>
            <div className="mt-1">
              <TeamSelect teams={teams} value={parentId} onChange={setParentId} placeholder="No parent team" />
            </div>
          </div>
          <div className="flex items-center gap-2 sm:col-span-4 pt-1">
            <Button size="sm" onClick={create} disabled={busy || !name.trim()} className="h-8 text-xs">
              Create Team
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)} disabled={busy} className="h-8 text-xs">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Paginated Teams List */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xs">
        {teams.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-muted-foreground">
            No teams established yet. Create one to organize your organizational reporting structure.
          </div>
        ) : filteredTeams.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            No teams match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {paginatedItems.map((team) => (
              <TeamRow
                key={team.id}
                team={team}
                teams={teams}
                users={users}
                onChanged={() => router.refresh()}
              />
            ))}
          </div>
        )}

        <DataPagination {...paginationProps} pageSizeOptions={[5, 10, 20]} />
      </div>
    </div>
  );
}

function TeamRow({
  team,
  teams,
  users,
  onChanged,
}: {
  team: TeamListItemDto;
  teams: TeamListItemDto[];
  users: UserOption[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [managerId, setManagerId] = useState(team.manager?.id ?? NONE);
  const [parentId, setParentId] = useState(team.parentTeamId ?? NONE);
  const [detail, setDetail] = useState<TeamDetailDto | null>(null);
  const [addUserId, setAddUserId] = useState(NONE);
  const [busy, setBusy] = useState(false);

  async function loadDetail() {
    try {
      setDetail(await apiRequest<TeamDetailDto>(`/api/admin/teams/${team.id}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load members.");
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail) void loadDetail();
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest(`/api/admin/teams/${team.id}`, {
        method: "PATCH",
        body: {
          name: name.trim(),
          managerId: managerId === NONE ? null : managerId,
          parentTeamId: parentId === NONE ? null : parentId,
        },
      });
      toast.success("Team updated");
      setEditing(false);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the team.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || !confirm(`Delete team “${team.name}”? Members are detached; child teams move up.`)) return;
    setBusy(true);
    try {
      await apiRequest(`/api/admin/teams/${team.id}`, { method: "DELETE" });
      toast.success("Team deleted");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the team.");
    } finally {
      setBusy(false);
    }
  }

  async function addMember() {
    if (addUserId === NONE || busy) return;
    setBusy(true);
    try {
      await apiRequest(`/api/admin/teams/${team.id}/members`, {
        method: "POST",
        body: { userId: addUserId },
      });
      toast.success("Member added");
      setAddUserId(NONE);
      await loadDetail();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add the member.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest(`/api/admin/teams/${team.id}/members/${userId}`, { method: "DELETE" });
      toast.success("Member removed");
      await loadDetail();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove the member.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="transition-colors hover:bg-muted/20">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{team.name}</span>
            <Badge variant="default" className="text-[10px]">
              {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
            </Badge>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {team.manager ? (
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3 text-primary/70" />
                <span>Manager: {team.manager.name}</span>
              </span>
            ) : (
              <span>No manager assigned</span>
            )}
            {team.parentTeamId && (
              <>
                <span>·</span>
                <span>Sub-team</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing((v) => !v)}
            className="h-7 px-2.5 text-xs"
          >
            {editing ? "Close" : "Edit"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={remove}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {editing && (
        <div className="border-t border-border/40 bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Team Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Manager</Label>
              <div className="mt-1">
                <UserSelect users={users} value={managerId} onChange={setManagerId} placeholder="No manager" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Parent Team</Label>
              <div className="mt-1">
                <TeamSelect
                  teams={teams.filter((t) => t.id !== team.id)}
                  value={parentId}
                  onChange={setParentId}
                  placeholder="No parent"
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={busy || !name.trim()} className="h-7 text-xs">
              Save Changes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {open && (
        <div className="border-t border-border/40 bg-surface-sunken/30 px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Team Members ({detail?.members.length ?? team.memberCount})
            </h4>
            <div className="flex items-center gap-2">
              <UserSelect
                users={users.filter((u) => !detail?.members.some((m) => m.userId === u.id))}
                value={addUserId}
                onChange={setAddUserId}
                placeholder="Select user to add…"
              />
              <Button
                size="sm"
                onClick={addMember}
                disabled={busy || addUserId === NONE}
                className="h-8 gap-1 text-xs"
              >
                <UserPlus className="h-3 w-3" />
                Add
              </Button>
            </div>
          </div>

          {!detail ? (
            <p className="text-xs text-muted-foreground">Loading members…</p>
          ) : detail.members.length === 0 ? (
            <p className="text-xs text-muted-foreground">No members on this team yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {detail.members.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">
                        {member.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-foreground">{member.name}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{member.email}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeMember(member.userId)}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UserSelect({
  users,
  value,
  onChange,
  placeholder,
}: {
  users: UserOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs font-medium">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="text-xs">
          {placeholder}
        </SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id} className="text-xs">
            {u.name} ({u.email})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TeamSelect({
  teams,
  value,
  onChange,
  placeholder,
}: {
  teams: TeamListItemDto[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs font-medium">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="text-xs">
          {placeholder}
        </SelectItem>
        {teams.map((t) => (
          <SelectItem key={t.id} value={t.id} className="text-xs">
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
