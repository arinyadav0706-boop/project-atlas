import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <FileQuestion className="h-6 w-6 text-muted-foreground" strokeWidth={1.8} />
      </div>
      <h1 className="text-[15px] font-semibold text-foreground">Not found</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        This page doesn&apos;t exist, or the item was deleted.
      </p>
      <Button variant="outline" size="sm" className="mt-6" asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
