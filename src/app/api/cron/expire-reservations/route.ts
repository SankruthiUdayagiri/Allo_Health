import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && authHeader !== `Bearer ${secret}`) {
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const now = new Date();
    const expired = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: now },
      },
    });

    if (expired.length === 0) {
      return NextResponse.json({ message: "No expired reservations found", releasedCount: 0 });
    }

    let releasedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const res of expired) {
        await tx.reservation.update({
          where: { id: res.id },
          data: {
            status: "RELEASED",
            releasedAt: now,
          },
        });

        const stock = await tx.inventory.findUnique({
          where: {
            productId_warehouseId: {
              productId: res.productId,
              warehouseId: res.warehouseId,
            },
          },
        });

        if (stock) {
          await tx.inventory.update({
            where: {
              productId_warehouseId: {
                productId: res.productId,
                warehouseId: res.warehouseId,
              },
            },
            data: {
              reservedUnits: Math.max(0, stock.reservedUnits - res.quantity),
            },
          });
        }
        releasedCount++;
      }
    }, {
      timeout: 30000,
      maxWait: 15000,
    });

    return NextResponse.json({
      message: "Expired reservations successfully processed",
      releasedCount,
    });
  } catch (err) {
    console.error("Vercel Cron batch expire failed:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to release batch holds." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
