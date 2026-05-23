import { NextResponse } from "next/server";
import { clearExpired } from "../../../../lib/cleanup";

export async function GET() {
  try {
    const released = await clearExpired();
    return NextResponse.json({
      message: "Cleanup complete",
      releasedCount: released,
    });
  } catch (err) {
    console.error("Cleanup job failed:", err);
    return NextResponse.json({ error: "Failed to run cleanup" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
