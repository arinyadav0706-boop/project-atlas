"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
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
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState<string>(NONE);
  const [parentId, setParentId] = useState<string>(NONE);
  const [busy, setBusy] = useState(false);

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
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Teams</h1>
          <p className="text-sm text-muted-foreground">
            Reporting structure — managers see their team&apos;s work across every project.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-4 w-4" />
          New team
        </Button>
      </div>

      {creating && (
        <div className="mb-6 grid gap-3 rounded-2xl border border-border bg-background shadow-card p-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="team-name">Name</Label>
            <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Platform" />
          </div>
          <div>
            <Label>Manager</Label>
            <UserSelect users={users} value={managerId} onChange={setManagerId} placeholder="No manager" />
          </div>
          <div>
            <Label>
              Parent team{" "}
              <span className="font-normal text-muted-foreground">
                (optional — only for nested org charts)
              </span>
            </Label>
            <TeamSelect teams={teams} value={parentId} onChange={setParentId} placeholder="No parent" />
          </div>
          <div className="flex items-end gap-2 sm:col-span-4">
            <Button size="sm" onClick={create} loading={busy} disabled={!name.trim()}>
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {teams.length === 0 && (
          <p className="rounded-2xl border border-border bg-background shadow-card px-4 py-10 text-center text-sm text-muted-foreground">
            No teams yet. Create one to model your reporting structure.
          </p>
        )}
        {teams.map((team) => (
          <TeamRow key={team.id} team={team} teams={teams} users={users} onChanged={() => router.refresh()} />
        ))}
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
    setBusy(true);
    try {
      await apiRequest(`/api/admin/teams/${team.id}/members/${userId}`, { method: "DELETE" });
      await loadDetail();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove the member.");
    } finally {
      setBusy(false);
    }
  }

  const otherTeams = teams.filter((t) => t.id !== team.id);

  return (
    <div className="rounded-2xl border border-border bg-background shadow-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={toggle} aria-label="Toggle members" className="text-muted-foreground">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground">{team.name}</div>
          <div className="text-xs text-muted-foreground">
            {team.manager ? `Manager: ${team.manager.name}` : "No manager"}
            {team.parentTeamName ? ` · Parent: ${team.parentTeamName}` : ""} · {team.memberCount}{" "}
            member{team.memberCount === 1 ? "" : "s"}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {editing && (
        <div className="grid gap-3 border-t border-border px-4 py-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Manager</Label>
            <UserSelect users={users} value={managerId} onChange={setManagerId} placeholder="No manager" />
          </div>
          <div>
            <Label>
              Parent team{" "}
              <span className="font-normal text-muted-foreground">
                (optional — only for nested org charts)
              </span>
            </Label>
            <TeamSelect teams={otherTeams} value={parentId} onChange={setParentId} placeholder="No parent" />
          </div>
          <div className="flex items-end gap-2 sm:col-span-4">
            <Button size="sm" onClick={save} loading={busy}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}

      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-2 flex items-end gap-2">
            <div className="flex-1">
              <Label>Add member</Label>
              <UserSelect users={users} value={addUserId} onChange={setAddUserId} placeholder="Choose a person…" />
            </div>
            <Button size="sm" onClick={addMember} disabled={addUserId === NONE || busy}>Add</Button>
          </div>
          {!detail ? (
            <p className="text-sm text-muted-foreground">Loading members…</p>
          ) : detail.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {detail.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="text-foreground">{m.name}</span>{" "}
                    <span className="text-muted-foreground">{m.email}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeMember(m.userId)}
                    disabled={busy}
                    className="text-xs text-muted-foreground hover:text-destructive focus-visible:underline focus-visible:outline-none"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
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
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name}
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
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {teams.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
