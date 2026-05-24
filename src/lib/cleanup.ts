import prisma from "./prisma";

let locked = false;
let lastCleanupTime = 0;

export async function clearExpired(): Promise<number> {
  if (locked) return 0;
  
  const now = Date.now();
  // Throttle background sweeps to at most once every 30 seconds
  if (now - lastCleanupTime < 30000) {
    return 0;
  }
  
  locked = true;
  lastCleanupTime = now;

  try {
    const expired = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
    });

    if (expired.length === 0) return 0;

    let released = 0;

    for (const res of expired) {
      try {
        await prisma.$transaction(async (tx) => {
          const current = await tx.reservation.findUnique({
            where: { id: res.id },
          });

          if (current && current.status === "PENDING") {
            await tx.reservation.update({
              where: { id: res.id },
              data: {
                status: "RELEASED",
                releasedAt: new Date(),
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
            released++;
          }
        }, {
          timeout: 30000,
          maxWait: 15000,
        });
      } catch (err) {
        console.error(`Release error for ${res.id}:`, err);
      }
    }

    return released;
  } finally {
    locked = false;
  }
}
