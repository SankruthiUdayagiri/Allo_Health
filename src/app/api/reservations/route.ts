import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { clearExpired } from "../../../lib/cleanup";
import { acquireLock } from "../../../lib/mutex";
import { ratelimit } from "../../../lib/redis";
import { reserveSchema } from "../../../lib/schemas";

export async function POST(req: NextRequest) {
  const idempKey = req.headers.get("idempotency-key");
  const path = req.nextUrl.pathname;

  try {
    // 1. Rate Limiting Check
    if (ratelimit) {
      const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
      const { success } = await ratelimit.limit(ip);
      if (!success) {
        return new NextResponse(
          JSON.stringify({
            error: "Too Many Requests",
            code: "RATE_LIMIT_EXCEEDED",
            message: "Rate limit exceeded. Please try again later.",
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // 2. Check Idempotency Key
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

    // Run lazy background cleanup
    await clearExpired();

    // 3. Zod Input Validation
    const body = await req.json().catch(() => ({}));
    const parsed = reserveSchema.safeParse(body);

    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(", ");
      const resBody = JSON.stringify({
        error: "Unprocessable Entity",
        code: "VALIDATION_ERROR",
        message: msg,
      });
      const status = 422;

      if (idempKey) await saveIdemp(idempKey, status, resBody);
      return new NextResponse(resBody, { status, headers: { "Content-Type": "application/json" } });
    }

    const { productId, warehouseId, quantity } = parsed.data;

    // 4. Concurrency-Safe Lock Acquisition
    const releaseLock = await acquireLock(productId, warehouseId);
    let result;

    try {
      result = await prisma.$transaction(async (tx) => {
        // Fetch inventory row with database-level row locking if PostgreSQL is used
        let stock;
        const isPostgres = process.env.DATABASE_URL?.startsWith("postgres");
        if (isPostgres) {
          const rows = await tx.$queryRawUnsafe<any[]>(
            `SELECT * FROM "Inventory" WHERE "productId" = $1 AND "warehouseId" = $2 FOR UPDATE`,
            productId,
            warehouseId
          );
          stock = rows[0] || null;
        } else {
          stock = await tx.inventory.findUnique({
            where: {
              productId_warehouseId: { productId, warehouseId },
            },
          });
        }

        if (!stock) {
          return {
            error: "Not Found",
            code: "STOCK_RECORD_NOT_FOUND",
            message: "Product stock not configured in selected warehouse.",
            status: 404,
          };
        }

        const available = stock.totalUnits - stock.reservedUnits;
        if (available < quantity) {
          return {
            error: "Conflict",
            code: "STOCK_EXHAUSTED",
            message: `Insufficient stock in selected warehouse. Available: ${Math.max(0, available)}, Requested: ${quantity}.`,
            status: 409,
          };
        }

        // Increment reserved physical inventory
        await tx.inventory.update({
          where: {
            productId_warehouseId: { productId, warehouseId },
          },
          data: {
            reservedUnits: stock.reservedUnits + quantity,
          },
        });

        // Create 10 minute hold reservation (10 * 60 * 1000 ms)
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const reservation = await tx.reservation.create({
          data: {
            productId,
            warehouseId,
            quantity,
            status: "PENDING",
            expiresAt,
            idempotencyKey: idempKey,
          },
          include: {
            product: true,
            warehouse: true,
          },
        });

        return { reservation, status: 201 };
      }, {
        timeout: 30000,
        maxWait: 15000,
      });
    } finally {
      await releaseLock();
    }

    // 5. Cache & Return Response
    if ("error" in result) {
      const resBody = JSON.stringify({
        error: result.error,
        code: result.code,
        message: result.message,
      });
      if (idempKey) await saveIdemp(idempKey, result.status, resBody);
      return new NextResponse(resBody, { status: result.status, headers: { "Content-Type": "application/json" } });
    }

    const resBody = JSON.stringify({
      message: "Hold created successfully",
      reservation: result.reservation,
    });

    if (idempKey) await saveIdemp(idempKey, 201, resBody);
    return new NextResponse(resBody, { status: 201, headers: { "Content-Type": "application/json" } });

  } catch (err) {
    console.error("POST /api/reservations error:", err);
    return new NextResponse(
      JSON.stringify({
        error: "Internal Server Error",
        code: "INTERNAL_ERROR",
        message: "An unexpected database exception occurred.",
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
        ttl: 86400, // 24 hour TTL (seconds)
      },
      update: {
        statusCode: status,
        responseBody: body,
        createdAt: new Date(),
      },
    });
  } catch (err) {
    console.error("Idempotency save failure:", err);
  }
}
