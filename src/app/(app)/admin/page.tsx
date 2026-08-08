import { redirect, notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { hasCapability } from "@/features/admin/authz/capabilities";
import { ADMIN_SECTIONS } from "@/features/admin/registry/admin-sections";

// /admin lands on the first section the actor may access (registry order).
export default async function AdminIndexPage() {
  const actor = await getActor();
  const first = actor
    ? [...ADMIN_SECTIONS]
        .sort((a, b) => a.order - b.order)
        .find((s) => hasCapability(actor, s.capability))
    : undefined;
  if (!first) notFound();
  redirect(first.href);
}
