"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" strokeWidth={1.8} />
      </div>
      <h1 className="text-[15px] font-semibold text-foreground">
        Something went wrong
      </h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        An unexpected error occurred. Your data is safe — try again, and if
        this keeps happening, tell an admin.
      </p>
      <Button variant="outline" size="sm" className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
