import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { clearExpired } from "../../../lib/cleanup";

export async function GET() {
  try {
    // Non-blocking background lazy cleanup of expired holds
    clearExpired().catch((err) => console.error("Background lazy cleanup error:", err));

    const products = await prisma.product.findMany({
      include: {
        inventories: {
          include: {
            warehouse: true,
          },
        },
      },
    });

    const data = products.map((p) => {
      const stock = p.inventories.map((inv) => ({
        warehouseId: inv.warehouseId,
        warehouseName: inv.warehouse.name,
        location: inv.warehouse.location,
        region: inv.warehouse.region,
        total: inv.totalUnits,
        reserved: inv.reservedUnits,
        available: Math.max(0, inv.totalUnits - inv.reservedUnits),
      }));

      return {
        ...p,
        stock,
        totalAvailable: stock.reduce((sum, item) => sum + item.available, 0),
      };
    });

    return NextResponse.json({ products: data });
  } catch (err) {
    console.error("Products endpoint error:", err);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
