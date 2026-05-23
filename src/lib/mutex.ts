import { redis } from "./redis";

export class Mutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const release = () => {
        const next = this.queue.shift();
        if (next) {
          next();
        } else {
          this.locked = false;
        }
      };

      if (this.locked) {
        this.queue.push(() => resolve(release));
      } else {
        this.locked = true;
        resolve(release);
      }
    });
  }
}

const memoryLock = new Mutex();

export async function acquireLock(productId: string, warehouseId: string): Promise<() => Promise<void>> {
  const lockKey = `lock:inventory:${productId}:${warehouseId}`;

  if (redis) {
    const ttl = 5; // 5 seconds distributed TTL
    const maxRetries = 100;
    const retryDelay = 50; // 50ms poll delay
    const token = Math.random().toString(36).substring(2, 9);

    for (let i = 0; i < maxRetries; i++) {
      const acquired = await redis.set(lockKey, token, { nx: true, ex: ttl });
      if (acquired === "OK") {
        return async () => {
          const currentToken = await redis.get(lockKey);
          if (currentToken === token) {
            await redis.del(lockKey);
          }
        };
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
    throw new Error("Lock acquisition timeout");
  } else {
    const release = await memoryLock.acquire();
    return async () => {
      release();
    };
  }
}
