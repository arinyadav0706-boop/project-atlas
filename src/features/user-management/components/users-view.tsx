"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { InviteUserDialog } from "./invite-user-dialog";
import type {
  ManagedUserDto,
  ManagedUserPageDto,
  OrgRoleDto,
} from "@/features/user-management/types/user-management.types";

export function UsersView({
  page,
  currentUserId,
  filters,
}: {
  page: ManagedUserPageDto;
  currentUserId: string;
  filters: { q: string; role: string; status: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { data, pagination } = page;
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  const [pending, setPending] = useState<string | null>(null);

  function setParams(next: Record<string, string | number | undefined>) {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") sp.delete(key);
      else sp.set(key, String(value));
    }
    router.push(`/admin/users?${sp.toString()}`);
  }

  async function mutate(userId: string, body: { orgRole?: OrgRoleDto; isActive?: boolean }) {
    setPending(userId);
    try {
      await apiRequest(`/api/admin/users/${userId}`, { method: "PATCH", body });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the user.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setParams({ q: (fd.get("q") as string).trim() || undefined, page: 1 });
          }}
        >
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Search name or email"
            className="h-9 w-56"
          />
          <FilterSelect
            value={filters.role}
            placeholder="All roles"
            options={[
              { value: "ADMIN", label: "Admin" },
              { value: "MEMBER", label: "Member" },
            ]}
            onChange={(v) => setParams({ role: v, page: 1 })}
          />
          <FilterSelect
            value={filters.status}
            placeholder="All statuses"
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Deactivated" },
            ]}
            onChange={(v) => setParams({ status: v, page: 1 })}
          />
          <Button type="submit" size="sm" variant="outline">
            Search
          </Button>
        </form>
        <InviteUserDialog onInvited={() => router.refresh()} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last sign-in</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No users match.
                </td>
              </tr>
            )}
            {data.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSelf={user.id === currentUserId}
                busy={pending === user.id}
                onRole={(role) => mutate(user.id, { orgRole: role })}
                onActive={(isActive) => mutate(user.id, { isActive })}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {pagination.total} {pagination.total === 1 ? "user" : "users"} · page{" "}
          {pagination.page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pagination.page <= 1}
            onClick={() => setParams({ page: pagination.page - 1 })}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pagination.page >= totalPages}
            onClick={() => setParams({ page: pagination.page + 1 })}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  busy,
  onRole,
  onActive,
}: {
  user: ManagedUserDto;
  isSelf: boolean;
  busy: boolean;
  onRole: (role: OrgRoleDto) => void;
  onActive: (isActive: boolean) => void;
}) {
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-3 py-2">
        <div className="font-medium text-foreground">
          {user.name}
          {isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
        </div>
        <div className="text-xs text-muted-foreground">{user.email}</div>
      </td>
      <td className="px-3 py-2">
        <Select
          value={user.orgRole}
          onValueChange={(v) => onRole(v as OrgRoleDto)}
          disabled={busy}
        >
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="MEMBER">Member</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2">
        {user.isActive ? (
          <Badge variant="accent" className="text-[10px]">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            Deactivated
          </Badge>
        )}
        {!user.hasSignedIn && (
          <Badge variant="outline" className="ml-1 text-[10px]">
            Invited
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "—"}
      </td>
      <td className="px-3 py-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onActive(!user.isActive)}
        >
          {user.isActive ? "Deactivate" : "Reactivate"}
        </Button>
      </td>
    </tr>
  );
}

function FilterSelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const ALL = "__all__";
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger className="h-9 w-36">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
