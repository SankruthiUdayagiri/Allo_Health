# Allo Health - High-Concurrency Inventory Reservation Platform

A production-grade, highly resilient clinical inventory reservation system built with Next.js (App Router), TypeScript, PostgreSQL, Prisma, and Upstash Redis.

## Technical Architecture Overview

To guarantee zero stock leakage and absolute transaction consistency under high parallel workloads, the platform implements a multi-layered distributed transaction control system.

### Concurrency Solution (Locking Pipeline)

When multiple concurrent customers compete for a low-stock product, database-level isolation alone can lead to deadlocks or stock overallocation due to read-write race conditions. We resolve this by combining a short-lived **Upstash Redis Distributed Lock** with an **Atomic database transaction**:

1. **Distributed Serialization Lock:**
   A short-lived Redis lock is acquired on the key `lock:inventory:{productId}:{warehouseId}` with a 5-second time-to-live (TTL). This ensures that only exactly one request can evaluate stock levels and execute inventory reserve queries at any millisecond boundary for a given SKU/warehouse combination.
   
2. **Atomic Postgres Isolation:**
   Within the lock boundaries, a database transaction checks whether the physical available units (`totalUnits - reservedUnits`) are sufficient. If stock exists, it atomically increments `reservedUnits` in the `Inventory` table and creates a 10-minute hold reservation record in the `Reservation` table.
   
3. **Graceful Release:**
   The Redis lock is immediately released via a safe token-matching delete sequence. If a client attempts to book stock while the lock is occupied, the request retries with exponential backoff before timing out.

```text
                  15+ Concurrent Clients
                            │
                            ▼
           ┌─────────────────────────────────┐
           │   Upstash Redis Lock Manager    │
           │  (lock:inventory:prod:whse)     │
           └────────────────┬────────────────┘
                            │
                    [Serialize Queue]
                            │
                            ▼
           ┌─────────────────────────────────┐
           │    Postgres Database Transaction│
           │  (Pessimistic stock validation) │
           └────────────────┬────────────────┘
                            │
                 Available Stock >= Qty?
                 /                     \
               Yes                      No
               /                         \
              ▼                           ▼
 ┌─────────────────────────┐  ┌─────────────────────────┐
 │ Increment reservedUnits │  │  Abruptly Rollback &    │
 │ Create PENDING Hold     │  │  Release lock (409)     │
 └─────────────────────────┘  └─────────────────────────┘
```

---

## Expiry Mechanisms & Hybrid Strategy

The platform maintains stock availability hygiene through a robust hybrid lazy-and-cron reclamation pipeline, balancing high efficiency with ultimate transactional accuracy:

1. **Lazy Reclamation on Catalog Read:**
   Every time `/api/products` is queried by a browser client, a background non-blocking task triggers a database sweep. It reclaims any expired `PENDING` reservation holds (older than 10 minutes) by updating their status to `RELEASED` and decrementing the corresponding `reservedUnits`. This happens asynchronously without blocking the immediate HTTP response, ensuring sub-millisecond catalog latencies.

2. **Minute-by-Minute Vercel Cron Job:**
   A secure cron job at `/api/cron/expire-reservations` runs every 60 seconds (configured in `vercel.json`). It performs a batch transaction releasing any expired pending reservations and restoring stock to active inventory. The endpoint is protected against malicious manual triggers via bearer authentication checking the Vercel `CRON_SECRET` header.

### Trade-offs & Hybrid Rationale:
* **Pure Lazy:** Extremely resource-efficient but results in "ghost holds"—where expired stock remains locked until another user happens to query the catalog page.
* **Pure Cron:** Keeps database levels consistently clean but suffers from a 60-second lag window where stock is unnecessarily held.
* **Hybrid Advantage:** The hybrid pipeline covers both weaknesses. The lazy path ensures that returning users instantly see and claim newly available stock, while the cron guarantees that the system state is kept pristine even during idle periods.

---

## Idempotency Engine

To prevent double billing or duplicate holds from network drops or repeated form submissions, we implement a strict idempotency key protocol:

* **Header Handshake:** The terminal requires an `Idempotency-Key` header with all write requests (`POST /api/reservations`, `POST /confirm`).
* **Cache Check:** Before triggering any locks, the server checks the database `IdempotencyRecord` table. If the key matches a recorded transaction in the last 24 hours, the server skips the database pipeline entirely and instantly replays the cached payload.
* **Cache Header Playback:** Replayed responses return a custom `X-Idempotent-Replayed: true` HTTP response header, signalling to the frontend client that the transaction was safe and duplicate actions were avoided.

---

## Local Development & Setup

### 1. Environment Configuration
Create a `.env` file in the root of the project (inspired by `.env.example`):
```env
DATABASE_URL="postgresql://username:password@hostname:5432/dbname?sslmode=require"
UPSTASH_REDIS_REST_URL="https://your-database-name.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your_token"
CRON_SECRET="your_vercel_cron_secret"
```
*Note: If `UPSTASH_REDIS_REST_URL` is omitted, the platform automatically and gracefully falls back to localized application-level lock queuing, ensuring offline compilation and local developer setups work flawlessly out-of-the-box!*

### 2. Install Packages
```bash
npm install
```

### 3. Setup Database Schema & Migrations
```bash
npx prisma db push
```

### 4. Seed Inventory Catalog
```bash
npx prisma db seed
```

### 5. Launch Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your web browser.

---

## Trade-offs at Scale & Future Roadmap

If deploying to a massive multi-million user marketplace, we recommend the following scaling transitions:

1. **Transactional Message Queue:**
   Rather than performing HTTP-level transaction locking, route reservation booking requests through a streaming message broker (e.g. Apache Kafka or RabbitMQ) to naturally throttle database write concurrency and level database spikes.
   
2. **Native Database Row Locking:**
   For enterprise PostgreSQL instances, transition from ORM-level locking to native database row locks using `SELECT FOR UPDATE` queries within raw SQL transactions, avoiding Upstash lock roundtrip network latency.

3. **Distributed Caching Layer:**
   Offload catalog read requests entirely to an edge CDN or Redis Cache layer, using invalidation webhooks on successful product checkouts, preventing heavy read queries from hitting the primary SQL cluster.
