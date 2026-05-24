import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../../lib/prisma";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const idempKey = req.headers.get("idempotency-key");
  const path = req.nextUrl.pathname;

  try {
    // Check Idempotency Key
    if (idempKey) {
      const cached = await prisma.idempotencyRecord.findUnique({
        where: { key: idempKey },
      });

      if (cached) {
        const age = (Date.now() - new Date(cached.createdAt).getTime()) / 1000;
        if (age > cached.ttl) {
          await prisma.idempotencyRecord.delete({ where: { key: idempKey } });
        } else {
          return new NextResponse(cached.responseBody, {
            status: cached.statusCode,
            headers: {
              "Content-Type": "application/json",
              "X-Idempotent-Replayed": "true",
            },
          });
        }
      }
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    if (!reservation) {
      const resBody = JSON.stringify({
        error: "Not Found",
        code: "RESERVATION_NOT_FOUND",
        message: "The requested reservation was not found.",
      });
      if (idempKey) await saveIdemp(idempKey, 404, resBody);
      return new NextResponse(resBody, { status: 404, headers: { "Content-Type": "application/json" } });
    }

    if (reservation.status === "CONFIRMED") {
      const resBody = JSON.stringify({ message: "Already confirmed", reservation });
      if (idempKey) await saveIdemp(idempKey, 200, resBody);
      return new NextResponse(resBody, { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (reservation.status === "RELEASED" || new Date() > reservation.expiresAt) {
      if (reservation.status === "PENDING") {
        await prisma.$transaction(async (tx) => {
          await tx.reservation.update({
            where: { id: reservation.id },
            data: {
              status: "RELEASED",
              releasedAt: new Date(),
            },
          });

          const stock = await tx.inventory.findUnique({
            where: {
              productId_warehouseId: {
                productId: reservation.productId,
                warehouseId: reservation.warehouseId,
              },
            },
          });

          if (stock) {
            await tx.inventory.update({
              where: {
                productId_warehouseId: {
                  productId: reservation.productId,
                  warehouseId: reservation.warehouseId,
                },
              },
              data: {
                reservedUnits: Math.max(0, stock.reservedUnits - reservation.quantity),
              },
            });
          }
        }, {
          timeout: 30000,
          maxWait: 15000,
        });
      }

      const resBody = JSON.stringify({
        error: "Gone",
        code: "RESERVATION_EXPIRED",
        message: "The reservation hold has expired and cannot be confirmed.",
      });
      if (idempKey) await saveIdemp(idempKey, 410, resBody);
      return new NextResponse(resBody, { status: 410, headers: { "Content-Type": "application/json" } });
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.reservation.findUnique({ where: { id } });

      if (!current || current.status !== "PENDING" || new Date() > current.expiresAt) {
        return {
          error: "Gone",
          code: "RESERVATION_EXPIRED",
          message: "Reservation hold expired during final confirmation.",
          status: 410,
        };
      }

      let stock;
      const isPostgres = process.env.DATABASE_URL?.startsWith("postgres");
      if (isPostgres) {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM "Inventory" WHERE "productId" = $1 AND "warehouseId" = $2 FOR UPDATE`,
          current.productId,
          current.warehouseId
        );
        stock = rows[0] || null;
      } else {
        stock = await tx.inventory.findUnique({
          where: {
            productId_warehouseId: {
              productId: current.productId,
              warehouseId: current.warehouseId,
            },
          },
        });
      }

      if (!stock) {
        return {
          error: "Internal Error",
          code: "STOCK_RECORD_NOT_FOUND",
          message: "Stock levels not found for confirmation.",
          status: 500,
        };
      }

      // Decrement totalUnits and reservedUnits atomically (stock is permanently sold)
      await tx.inventory.update({
        where: {
          productId_warehouseId: {
            productId: current.productId,
            warehouseId: current.warehouseId,
          },
        },
        data: {
          totalUnits: Math.max(0, stock.totalUnits - current.quantity),
          reservedUnits: Math.max(0, stock.reservedUnits - current.quantity),
        },
      });

      const updated = await tx.reservation.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
        include: { product: true, warehouse: true },
      });

      return { reservation: updated, status: 200 };
    }, {
      timeout: 30000,
      maxWait: 15000,
    });

    if ("error" in result) {
      const resBody = JSON.stringify({
        error: result.error,
        code: result.code,
        message: result.message,
      });
      if (idempKey) await saveIdemp(idempKey, result.status, resBody);
      return new NextResponse(resBody, { status: result.status, headers: { "Content-Type": "application/json" } });
    }

    const resBody = JSON.stringify({ message: "Confirmed", reservation: result.reservation });
    if (idempKey) await saveIdemp(idempKey, 200, resBody);
    return new NextResponse(resBody, { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Confirm error:", err);
    return new NextResponse(
      JSON.stringify({
        error: "Internal Server Error",
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred during confirmation.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function saveIdemp(key: string, status: number, body: string) {
  try {
    await prisma.idempotencyRecord.upsert({
      where: { key },
      create: {
        key,
        statusCode: status,
        responseBody: body,
        ttl: 86400, // 24 hours
      },
      update: {
        statusCode: status,
        responseBody: body,
        createdAt: new Date(),
      },
    });
  } catch (err) {
    console.error("Confirm idempotency cache save failed:", err);
  }
}
