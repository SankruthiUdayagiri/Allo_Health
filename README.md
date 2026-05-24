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

### 1. Hosted Cloud Database Setup
To ensure this application works seamlessly out-of-the-box, it is configured with a live serverless cloud PostgreSQL database hosted on **AWS Neon**. This ensures the application runs with a permanent hosted database.

To run locally, simply copy the credentials from `.env.example` into your `.env` file (which is pre-configured with the AWS Neon PostgreSQL database URL):
```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
CRON_SECRET="super-secret-cron-token"
```
*Note: If `UPSTASH_REDIS_REST_URL` is omitted, the platform automatically and gracefully falls back to localized application-level lock queuing, ensuring offline compilation and local developer setups work flawlessly out-of-the-box!*

---

## Hardened Core Scenario Testing

Here is how each critical order safety requirement is implemented and presented:

### A. 409 "Not Enough Stock" Visibility (Visible to User)
* **Under the Hood:** If the available units inside the serialized database transaction drops below the requested amount, the `/api/reservations` endpoint immediately returns a **`409 Conflict`** response containing `STOCK_EXHAUSTED`.
* **User Experience:** When the client receives a 409, a beautiful floating **rose-accented glassmorphic toast notification** slides onto the screen displaying: **`System Conflict: Not enough stock — this item was just taken.`**. It prompts the user to select another facility or product, completely preventing double booking.
* **Test Case:** Open two tabs on a low-stock item (e.g. 1 unit remaining) and click "Reserve" at the exact same moment. One tab will redirect to checkout, and the other will immediately show the `Not enough stock — this item was just taken.` error banner.

### B. 410 "Expired Reservation" Visibility (Visible to User)
* **Under the Hood:** If a customer attempts to pay for or confirm a hold that has expired (older than 10 minutes or marked as `RELEASED`), the `/api/reservations/:id/confirm` endpoint rejects the query with a **`410 Gone`** response containing `RESERVATION_EXPIRED`.
* **User Experience:** 
  1. **Passive Expiry:** If a customer lets the 10-minute timer run out on the checkout page, the circular countdown dial turns bright crimson, a warning pulse triggers, and the checkout panel is replaced by an **explicit rose-red error card** displaying: **`This reservation expired: Hold Allocation Expired. Your high-concurrency inventory reservation has hit the 10-minute timeout. Stock levels have been safely released.`**
  2. **Active Expiry (Confirm Attempt):** If a customer tries to confirm a reservation that has already expired in the database (e.g. from network lag), a warning card slides up displaying **`Confirmation Failed: The reservation hold has expired and cannot be confirmed.`**
* **Test Case:** Navigate to `/checkout/{id}`, wait for the timer to count down to zero, or manually trigger the cron endpoint to expire it. You will see the checkout form lock and the expired state banner render instantly.

### C. Cancel Button & Stock Releasing (Verified)
* **Under the Hood:** Clicking the "Cancel Reservation" button on the checkout page triggers a `POST` request to `/api/reservations/:id/release`. Within an isolated database transaction, the platform decrements `reservedUnits` in the `Inventory` table and updates the reservation status to `RELEASED`.
* **User Experience:** Clicking cancel triggers an instant release, rolls back reserved inventory, and returns the customer to the catalog page with a high-visibility amber toast confirming: **`System Alert: Reservation cancelled`**. 
* **Test Case:** Reserve an item (e.g. available units drops from 5 to 4). On the checkout page, click **Cancel Reservation**. You are returned to the catalog and will see the available units instantly restored back to 5.

### D. Production Cron Job / Expiry Mechanism
* **Lazy Cleanups:** A non-blocking background sweep runs every time a shopper requests `/api/products`, ensuring returning users instantly reclaim expired inventory hold spaces with zero lag.
* **Production Cron:** A secure automated cron job is configured at `/api/cron/expire-reservations` that executes every minute. It runs a single transaction batch sweeping `PENDING` records that have passed their `expiresAt` boundaries, updating statuses to `RELEASED` and decrementing inventory reservation counts in one atomic pass.


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
