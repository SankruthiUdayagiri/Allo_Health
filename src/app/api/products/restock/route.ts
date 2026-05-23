import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";

export async function POST() {
  try {
    await prisma.inventory.updateMany({
      data: {
        totalUnits: 20,
        reservedUnits: 0,
      },
    });

    await prisma.reservation.deleteMany();

    return NextResponse.json({
      success: true,
      message: "Catalog successfully replenished to 20 units!",
    });
  } catch (err) {
    console.error("Restock failed:", err);
    return NextResponse.json(
      { error: "Failed to restock inventory catalog." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
