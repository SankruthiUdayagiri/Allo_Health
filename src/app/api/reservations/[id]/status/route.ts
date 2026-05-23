import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../../lib/prisma";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    const res = await prisma.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!res) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: res.id,
      status: res.status,
      expiresAt: res.expiresAt,
      isExpired: new Date() > res.expiresAt,
    });
  } catch (err) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
