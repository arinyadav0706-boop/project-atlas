import { redirect } from "next/navigation";

// The landing page was renamed Dashboard → Home (ADR-0012). Keep this route as a
// permanent redirect so existing bookmarks/links don't break.
export default function DashboardRedirect() {
  redirect("/home");
}
