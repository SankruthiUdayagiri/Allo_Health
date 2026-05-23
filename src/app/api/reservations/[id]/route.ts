import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        product: true,
        warehouse: true,
      },
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reservation hold not found." }, { status: 404 });
    }

    return NextResponse.json({ reservation });
  } catch (error) {
    console.error("GET /api/reservations/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
export const dynamic = "force-dynamic";
