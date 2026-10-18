import { redirect } from "next/navigation";
import { getActor, getSession } from "@/features/authentication/services/actor.service";
import { HomeService } from "@/features/home/services/home.service";
import { AppFrame } from "@/shared/components/ui/app-frame";
import { HomeCommandCenter } from "@/features/home/components/home-command-center";

export default async function HomePage() {
  const [actor, session] = await Promise.all([getActor(), getSession()]);
  if (!actor) redirect("/sign-in");
  const firstName = (session?.user?.name ?? "there").split(" ")[0] ?? "there";
  const homeData = await HomeService.getHome(actor);

  return (
    <AppFrame>
      <HomeCommandCenter
        firstName={firstName}
        greetingText={greeting()}
        data={homeData}
      />
    </AppFrame>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
