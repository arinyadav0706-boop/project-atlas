"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Camera, Trash2, UserRound } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { PageHeader } from "@/shared/components/ui/page-header";
import { Switch } from "@/shared/components/ui/switch";
import {
  ALLOWED_AVATAR_MIME_TYPES,
  MAX_AVATAR_BYTES,
  MAX_AVATAR_MB,
} from "@/features/profile/validation/avatar.rules";
import { updateProfileSchema } from "@/features/profile/validation/profile.schemas";
import type { ProfileDto } from "@/features/profile/types/profile.types";

const roleLabel: Record<string, string> = { LEAD: "Lead", MEMBER: "Member", VIEWER: "Viewer" };

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ProfileView({ profile }: { profile: ProfileDto }) {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(profile.name);
  const [notificationsEnabled, setNotificationsEnabled] = useState(profile.notificationsEnabled);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [saving, setSaving] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const trimmed = name.trim();
  const nameError = updateProfileSchema.safeParse({ name }).success
    ? null
    : "Name must be 1–100 characters.";
  // "Save changes" governs the name only; the notifications switch saves itself.
  const dirty = trimmed !== profile.name;
  const canSave = dirty && !nameError && !saving;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const updated = await apiRequest<ProfileDto>("/api/users/me", {
        method: "PATCH",
        body: { name: trimmed },
      });
      setName(updated.name);
      // Refresh the JWT-backed session so the top bar reflects the new name
      // (ADR-0027), then re-render server components reading the User row.
      await updateSession();
      router.refresh();
      toast.success("Name updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save your name.");
    } finally {
      setSaving(false);
    }
  }

  // The switch is its own save: flipping it persists immediately (optimistic,
  // reverted on failure) — no dependency on the "Save changes" button.
  async function onToggleNotifications(next: boolean) {
    if (notifBusy) return;
    setNotificationsEnabled(next); // optimistic
    setNotifBusy(true);
    try {
      const updated = await apiRequest<ProfileDto>("/api/users/me", {
        method: "PATCH",
        body: { notificationsEnabled: next },
      });
      setNotificationsEnabled(updated.notificationsEnabled);
      toast.success(next ? "Notifications on." : "Notifications off.");
    } catch (error) {
      setNotificationsEnabled(!next); // revert
      toast.error(error instanceof Error ? error.message : "Couldn't update notifications.");
    } finally {
      setNotifBusy(false);
    }
  }

  async function onPickAvatar(file: File) {
    // Client-side pre-check for fast feedback; the server re-validates (BR-4).
    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
      toast.error("Avatars must be a PNG, JPEG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(`Image is too large — the limit is ${MAX_AVATAR_MB} MB.`);
      return;
    }
    setAvatarBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/users/me/avatar", { method: "POST", body: form });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Upload failed.");
      }
      const updated = (await response.json()) as ProfileDto;
      setAvatarUrl(updated.avatarUrl);
      await updateSession();
      router.refresh();
      toast.success("Avatar updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't upload your avatar.");
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onRemoveAvatar() {
    setAvatarBusy(true);
    try {
      const updated = await apiRequest<ProfileDto>("/api/users/me/avatar", { method: "DELETE" });
      setAvatarUrl(updated.avatarUrl);
      await updateSession();
      router.refresh();
      toast.success("Avatar removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove your avatar.");
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    // `max-w-2xl` is kept rather than moved to PageShell: this is a single
    // column of form fields, and a form stretched to a dashboard's width is
    // harder to fill in, not easier.
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        icon={<UserRound />}
        title="Profile"
        subtitle="Manage how you appear across EAGLES and your personal preferences."
      />

      {/* Identity */}
      <section className="rounded-2xl border border-border bg-background p-5 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">Identity</h2>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2">
            <Avatar className="h-20 w-20">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={profile.name} />}
              <AvatarFallback className="text-lg font-medium">
                {initialsOf(profile.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={avatarBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-3.5 w-3.5" />
                {avatarUrl ? "Replace" : "Upload"}
              </Button>
              {avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={avatarBusy}
                  aria-label="Remove avatar"
                  onClick={onRemoveAvatar}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onPickAvatar(file);
              }}
            />
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={nameError ? true : undefined}
              />
              {nameError && <p className="mt-1 text-xs text-destructive">{nameError}</p>}
            </div>
            <div>
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={profile.email} disabled readOnly />
              <p className="mt-1 text-xs text-muted-foreground">
                Email is tied to your sign-in and can’t be changed here.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={onSave} loading={saving} disabled={!canSave}>
            Save changes
          </Button>
        </div>
      </section>

      {/* Notifications */}
      <section className="rounded-2xl border border-border bg-background p-5 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">In-app notifications</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Get notified about assignments, mentions, and status changes. When off, no new
              notifications are created for you.
            </p>
          </div>
          <Switch
            checked={notificationsEnabled}
            onCheckedChange={onToggleNotifications}
            disabled={notifBusy}
            aria-label="In-app notifications"
          />
        </div>
      </section>

      {/* Access (read-only) */}
      <section className="rounded-2xl border border-border bg-background p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Access</h2>
          <Badge variant={profile.orgRole === "ADMIN" ? "accent" : "outline"}>
            {profile.orgRole === "ADMIN" ? "Organization admin" : "Member"}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Your role and project access are managed by an administrator.
        </p>
        <div className="mt-4">
          {profile.memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You’re not a member of any projects yet.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {profile.memberships.map((m) => (
                <li key={m.projectId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <Link
                    href={`/projects/${m.projectId}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:text-accent"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{m.projectKey}</span>{" "}
                    {m.projectName}
                  </Link>
                  <Badge variant="outline">{roleLabel[m.role] ?? m.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
