import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";

export async function GET() {
  try {
    const reservations = await prisma.reservation.findMany({
      include: {
        product: true,
        warehouse: true,
      },
      orderBy: {
        expiresAt: "desc",
      },
    });
    return NextResponse.json({ reservations });
  } catch (err) {
    console.error("Admin reservations error:", err);
    return NextResponse.json({ error: "Failed to fetch reservations" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
