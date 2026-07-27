import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProfileService } from "@/features/profile/services/profile.service";
import { ProfileView } from "@/features/profile/components/profile-view";

export const metadata: Metadata = { title: "Profile · EAGLES" };

// Screen #17 (16_profile.md). The account settings for the authenticated caller.
export default async function ProfilePage() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  const profile = await ProfileService.getMyProfile(actor);
  return <ProfileView profile={profile} />;
}
