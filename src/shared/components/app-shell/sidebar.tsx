import Link from "next/link";
import { LayoutDashboard, FolderKanban, ShieldCheck } from "lucide-react";

// App shell — docs/05_UI/02_Screens_and_Information_Architecture.md §1.
// Admin link visibility (ADMIN-only) is enforced again server-side by the
// Admin module's own routes once built — this is a UX convenience, not the
// security boundary (Coding Standards §7).
export function Sidebar({ isOrgAdmin }: { isOrgAdmin: boolean }) {
  return (
    <nav className="flex h-full w-56 flex-col gap-1 border-r border-border bg-surface p-3">
      <span className="mb-4 px-2 text-sm font-semibold text-foreground">EAGLES</span>

      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
      >
        <LayoutDashboard className="h-4 w-4" />
        Dashboard
      </Link>

      <Link
        href="/projects"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
      >
        <FolderKanban className="h-4 w-4" />
        Projects
      </Link>

      {isOrgAdmin && (
        <Link
          href="/admin"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
        >
          <ShieldCheck className="h-4 w-4" />
          Admin
        </Link>
      )}
    </nav>
  );
}
