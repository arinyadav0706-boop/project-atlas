import { NextResponse } from "next/server";
import { prisma } from "@/shared/lib/db";

// Used by Docker/Azure liveness checks — docs/06_Infrastructure/01_Infrastructure_Overview.md §5.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
