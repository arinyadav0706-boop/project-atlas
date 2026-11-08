"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, UserPlus, Shield, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { DataPagination } from "@/shared/components/ui/data-pagination";
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
      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-2xs">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setParams({ q: (fd.get("q") as string).trim() || undefined, page: 1 });
          }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={filters.q}
              placeholder="Search by name or email…"
              className="h-8 w-56 pl-8 text-xs"
            />
          </div>

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

          <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
            Filter
          </Button>
        </form>

        <InviteUserDialog onInvited={() => router.refresh()} />
      </div>

      {/* High-Density Users Table with Sticky Header */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xs">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-xs select-none">
              <tr className="h-9">
                <th className="px-4">User</th>
                <th className="px-4">Role</th>
                <th className="px-4">Status</th>
                <th className="px-4">Last Active</th>
                <th className="px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="h-28 text-center text-xs text-muted-foreground">
                    No users match the search criteria.
                  </td>
                </tr>
              ) : (
                data.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelf={user.id === currentUserId}
                    busy={pending === user.id}
                    onRole={(role) => mutate(user.id, { orgRole: role })}
                    onActive={(isActive) => mutate(user.id, { isActive })}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Integrated DataPagination */}
        <DataPagination
          mode="numbered"
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          itemLabel="users"
          onPageChange={(p) => setParams({ page: p })}
          onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
          pageSizeOptions={[10, 25, 50, 100]}
        />
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
    <tr className="group h-11 transition-colors hover:bg-muted/40">
      <td className="px-4">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-7 w-7 ring-1 ring-border">
            <AvatarImage src={user.avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="text-[10px] font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <span className="truncate">{user.name}</span>
              {isSelf && (
                <span className="rounded-xs bg-primary/10 px-1 py-0.2 font-mono text-[9px] font-semibold text-primary">
                  You
                </span>
              )}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">{user.email}</div>
          </div>
        </div>
      </td>

      <td className="px-4">
        <Select
          value={user.orgRole}
          onValueChange={(v) => onRole(v as OrgRoleDto)}
          disabled={busy || isSelf}
        >
          <SelectTrigger className="h-7 w-28 text-xs font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ADMIN" className="text-xs">
              Admin
            </SelectItem>
            <SelectItem value="MEMBER" className="text-xs">
              Member
            </SelectItem>
          </SelectContent>
        </Select>
      </td>

      <td className="px-4">
        <div className="flex items-center gap-1.5">
          {user.isActive ? (
            <Badge variant="default" className="text-[10px]">
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
              Deactivated
            </Badge>
          )}
          {!user.hasSignedIn && (
            <Badge variant="outline" className="text-[10px]">
              Invited
            </Badge>
          )}
        </div>
      </td>

      <td className="px-4 text-[11px] text-muted-foreground tabular-nums">
        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never"}
      </td>

      <td className="px-4 text-right">
        {!isSelf && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onActive(!user.isActive)}
            className="h-7 px-2.5 text-xs"
          >
            {user.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        )}
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
      <SelectTrigger className="h-8 w-36 text-xs font-medium">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL} className="text-xs">
          {placeholder}
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
