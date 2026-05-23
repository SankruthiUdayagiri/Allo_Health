import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../../lib/prisma";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    if (reservation.status === "RELEASED") {
      return NextResponse.json({ message: "Already released", reservation });
    }

    if (reservation.status === "CONFIRMED") {
      return NextResponse.json({ error: "Cannot release confirmed reservation" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.reservation.findUnique({ where: { id } });

      if (!current || current.status !== "PENDING") {
        return current;
      }

      const stock = await tx.inventory.findUnique({
        where: {
          productId_warehouseId: {
            productId: current.productId,
            warehouseId: current.warehouseId,
          },
        },
      });

      if (stock) {
        await tx.inventory.update({
          where: {
            productId_warehouseId: {
              productId: current.productId,
              warehouseId: current.warehouseId,
            },
          },
          data: {
            reservedUnits: Math.max(0, stock.reservedUnits - current.quantity),
          },
        });
      }

      return await tx.reservation.update({
        where: { id },
        data: {
          status: "RELEASED",
          releasedAt: new Date(),
        },
        include: { product: true, warehouse: true },
      });
    }, {
      timeout: 30000,
      maxWait: 15000,
    });

    return NextResponse.json({
      message: "Released successfully",
      reservation: updated,
    });

  } catch (err) {
    console.error("Release error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
