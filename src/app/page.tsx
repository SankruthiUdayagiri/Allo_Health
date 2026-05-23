"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Activity, 
  Database, 
  MapPin, 
  RefreshCw, 
  ShieldAlert, 
  ShoppingBag, 
  Layers,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Flame,
  LayoutDashboard
} from "lucide-react";

interface StockInfo {
  warehouseId: string;
  warehouseName: string;
  location: string;
  region: string;
  total: number;
  reserved: number;
  available: number;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  stock: StockInfo[];
  totalAvailable: number;
}

interface Warehouse {
  id: string;
  name: string;
  location: string;
  region: string;
}

interface Toast {
  id: string;
  type: "success" | "error" | "warning";
  message: string;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemCleaning, setSystemCleaning] = useState(false);
  const [systemRestocking, setSystemRestocking] = useState(false);
  
  const [selectedWarehouse, setSelectedWarehouse] = useState<Record<string, string>>({});
  const [selectedQuantity, setSelectedQuantity] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Warehouse selector tab/filter
  const [warehouseFilter, setWarehouseFilter] = useState<string>("ALL");

  const fetchCatalog = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const prodRes = await fetch("/api/products");
      const prodData = await prodRes.json();
      
      const whRes = await fetch("/api/warehouses");
      const whData = await whRes.json();

      if (prodData.products) {
        setProducts(prodData.products);
        
        const initialWH: Record<string, string> = { ...selectedWarehouse };
        const initialQty: Record<string, number> = { ...selectedQuantity };

        prodData.products.forEach((p: Product) => {
          if (!initialWH[p.id] && p.stock && p.stock.length > 0) {
            const availableWH = p.stock.find((s) => s.available > 0);
            initialWH[p.id] = availableWH ? availableWH.warehouseId : p.stock[0].warehouseId;
          }
          if (!initialQty[p.id]) {
            initialQty[p.id] = 1;
          }
        });
        setSelectedWarehouse(initialWH);
        setSelectedQuantity(initialQty);
      }

      if (whData.warehouses) {
        setWarehouses(whData.warehouses);
      }
    } catch (error) {
      console.error("Error loading system data:", error);
      showToast("error", "Failed to sync catalog with inventory server.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
    
    // Real-time stock count updates via polling every 30s (SWR-like)
    const interval = setInterval(() => fetchCatalog(true), 30000);
    return () => clearInterval(interval);
  }, []);

  // Detect Redirect with cancellation parameter
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("cancelled") === "true") {
        // Show literal cancellation warning toast
        showToast("warning", "Reservation cancelled");
        // Strip parameters cleanly
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // Update selected warehouses for each product card when global filter changes
  useEffect(() => {
    if (warehouseFilter === "ALL") return;
    
    setSelectedWarehouse((prev) => {
      const updated = { ...prev };
      products.forEach((p) => {
        const hasWH = p.stock.some((s) => s.warehouseId === warehouseFilter);
        if (hasWH) {
          updated[p.id] = warehouseFilter;
        }
      });
      return updated;
    });
  }, [warehouseFilter, products]);

  const showToast = (type: "success" | "error" | "warning", message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const triggerCleanup = async () => {
    setSystemCleaning(true);
    try {
      const res = await fetch("/api/cron/expire-reservations", {
        headers: {
          "Authorization": "Bearer super-secret-cron-token"
        }
      });
      const data = await res.json();
      if (res.ok) {
        showToast(
          "success", 
          `Cron Expire complete. Released ${data.releasedCount || 0} expired hold reservations.`
        );
        await fetchCatalog(true);
      } else {
        showToast("error", "Audit request rejected by server.");
      }
    } catch (err) {
      showToast("error", "Failed to contact cron agent.");
    } finally {
      setSystemCleaning(false);
    }
  };

  const triggerRestock = async () => {
    setSystemRestocking(true);
    try {
      const res = await fetch("/api/products/restock", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast("success", data.message || "Catalog successfully restocked!");
        await fetchCatalog(true);
      } else {
        showToast("error", "Restock request rejected by server.");
      }
    } catch (err) {
      showToast("error", "Failed to reach restocking endpoint.");
    } finally {
      setSystemRestocking(false);
    }
  };

  const handleReserve = async (productId: string, productName: string) => {
    const warehouseId = selectedWarehouse[productId];
    const quantity = selectedQuantity[productId] || 1;

    if (!warehouseId) {
      showToast("warning", "Please select a physical warehouse.");
      return;
    }

    setSubmitting((prev) => ({ ...prev, [productId]: true }));

    const idempotencyKey = `idemp_hold_${productId.substring(0, 4)}_${warehouseId.substring(0, 4)}_${Date.now()}`;

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          productId,
          warehouseId,
          quantity,
        }),
      });

      const data = await res.json();

      if (res.status === 201) {
        showToast("success", `Secured ${quantity} units of ${productName}! Routing to payment checkout...`);
        setTimeout(() => {
          window.location.href = `/checkout/${data.reservation.id}`;
        }, 1200);
      } else if (res.status === 409) {
        // Explicit 409 Conflict Toast String requirement
        showToast("error", "Not enough stock — this item was just taken.");
        await fetchCatalog(true);
      } else {
        showToast("error", data.message || "Failed to place inventory hold.");
        await fetchCatalog(true);
      }
    } catch (err) {
      console.error(err);
      showToast("error", "Connection timed out. Please try again.");
    } finally {
      setSubmitting((prev) => ({ ...prev, [productId]: false }));
    }
  };

  return (
    <div className="relative min-h-screen pb-24 overflow-hidden bg-[#030307]">
      {/* Background glow glows */}
      <div className="absolute top-0 right-0 w-[45vw] h-[45vw] bg-glow-purple -z-10 rounded-full" />
      <div className="absolute bottom-1/4 left-0 w-[45vw] h-[45vw] bg-glow-emerald -z-10 rounded-full" />

      {/* Grid background */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff04_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-40 -z-20" />

      {/* Nav */}
      <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-[#030307]/75 backdrop-blur-md">
        <div className="flex items-center justify-between max-w-7xl h-20 px-6 mx-auto">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-[0_0_20px_rgba(124,58,237,0.3)]">
              <ShoppingBag className="w-5 h-5 text-white" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white">ALLO</span>
              <span className="text-xs block text-violet-400 font-semibold tracking-wider uppercase -mt-1">Inventory Platform</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Live Indicator */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/10 bg-emerald-500/5 text-emerald-400 text-xs font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Inventory Guard Active
            </div>

            {/* Admin link */}
            <Link
              href="/admin"
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-300 hover:text-white transition-all border border-white/10 rounded-lg hover:bg-white/5"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Admin Room
            </Link>

            {/* Replenish */}
            <button
              onClick={triggerRestock}
              disabled={systemRestocking || systemCleaning}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wide text-white transition-all border rounded-lg shadow-md cursor-pointer bg-gradient-to-tr from-emerald-600 to-teal-500 border-emerald-500/20 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95 disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${systemRestocking ? "animate-pulse" : ""}`} />
              RESTOCK
            </button>

            {/* Audit */}
            <button
              onClick={triggerCleanup}
              disabled={systemCleaning || systemRestocking}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold tracking-wide text-white transition-all border rounded-lg shadow-sm cursor-pointer glass-card border-white/10 hover:border-violet-500/40 hover:bg-violet-950/20 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${systemCleaning ? "animate-spin text-violet-400" : ""}`} />
              AUDIT
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl px-6 mx-auto mt-12">
        
        {/* Hero Banner */}
        <section className="relative py-12 text-center rounded-3xl border border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent backdrop-blur-sm overflow-hidden mb-12">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-gradient-to-tr from-violet-600/10 to-indigo-600/10 rounded-full blur-3xl pointer-events-none -z-10" />
          
          <div className="flex items-center justify-center gap-2 px-3 py-1 text-xs font-semibold tracking-wider text-violet-400 uppercase rounded-full border border-violet-500/15 bg-violet-500/5 w-fit mx-auto mb-4">
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            Zero Stock Leakage Concurrency safety
          </div>
          
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
            Allo Health <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">Inventory & Hold</span> Hub
          </h1>
          <p className="max-w-xl mx-auto text-sm leading-relaxed text-zinc-400 font-medium">
            Acquire distributed locks on Upstash Redis to secure transaction channels, check PostgreSQL stock levels in isolation, and release expired reservations instantly.
          </p>
        </section>

        {/* Global Warehouse Filter (Tabs) */}
        <section className="mb-12 flex flex-col gap-3">
          <span className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-violet-400" />
            Global Warehouse Stock View Filter
          </span>
          
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setWarehouseFilter("ALL")}
              className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all ${
                warehouseFilter === "ALL"
                  ? "bg-violet-600 text-white border-violet-500/30 shadow-[0_0_15px_rgba(124,58,237,0.2)]"
                  : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-white"
              }`}
            >
              All Facilities
            </button>
            {warehouses.map((w) => (
              <button
                key={w.id}
                onClick={() => setWarehouseFilter(w.id)}
                className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all ${
                  warehouseFilter === w.id
                    ? "bg-violet-600 text-white border-violet-500/30 shadow-[0_0_15px_rgba(124,58,237,0.2)]"
                    : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-white"
                }`}
              >
                {w.name} ({w.region})
              </button>
            ))}
          </div>
        </section>

        {/* Catalog layout */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="glass-card rounded-2xl h-96 border border-white/5 p-6 animate-pulse space-y-6">
                <div className="w-full h-40 bg-white/5 rounded-xl" />
                <div className="w-2/3 h-5 bg-white/5 rounded" />
                <div className="w-full h-3 bg-white/5 rounded" />
                <div className="w-full h-10 bg-white/5 rounded-xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Catalog Grid */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {products.map((product) => {
                  const whId = selectedWarehouse[product.id];
                  const activeStock = product.stock.find((s) => s.warehouseId === whId);
                  const availableCount = activeStock ? activeStock.available : 0;
                  const qty = selectedQuantity[product.id] || 1;

                  // Render card only if it has inventory for selected global filter
                  const hasInventoryForFilter = warehouseFilter === "ALL" || product.stock.some(s => s.warehouseId === warehouseFilter);
                  if (!hasInventoryForFilter) return null;

                  return (
                    <article 
                      key={product.id} 
                      className="glass-card rounded-2xl overflow-hidden flex flex-col h-full border border-white/5 group hover:border-white/10 transition-all"
                    >
                      <div className="relative h-48 w-full overflow-hidden bg-neutral-900 border-b border-white/5">
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="object-cover w-full h-full transition-transform duration-75 group-hover:scale-[1.01]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                          <span className="text-xs font-mono px-2.5 py-1 rounded bg-black/60 backdrop-blur-sm border border-white/10 text-zinc-400">
                            {product.sku}
                          </span>
                          <span className="text-xl font-black text-white tracking-tight">
                            ₹{product.price.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>

                      <div className="p-6 flex flex-col flex-1 justify-between gap-6">
                        <div className="flex flex-col gap-2">
                          <h3 className="text-base font-bold text-white tracking-tight leading-snug">
                            {product.name}
                          </h3>
                          <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                            {product.description}
                          </p>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-white/5">
                          {/* Warehouse Select */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase flex items-center gap-1.5">
                              <MapPin className="w-3 h-3 text-violet-500" />
                              Select Warehousing Location
                            </label>
                            <select
                              value={whId || ""}
                              onChange={(e) => {
                                setSelectedWarehouse((prev) => ({ ...prev, [product.id]: e.target.value }));
                                setSelectedQuantity((prev) => ({ ...prev, [product.id]: 1 }));
                              }}
                              className="w-full text-xs font-semibold py-2 px-3 rounded-lg bg-neutral-950 border border-white/10 text-white outline-none cursor-pointer focus:border-violet-500/50"
                            >
                              {product.stock
                                .filter(s => warehouseFilter === "ALL" || s.warehouseId === warehouseFilter)
                                .map((s) => (
                                  <option key={s.warehouseId} value={s.warehouseId}>
                                    {s.warehouseName} ({s.location})
                                  </option>
                                ))}
                            </select>
                          </div>

                          {/* Stock Badges with Amber under 5 units trigger */}
                          <div className="p-3 rounded-xl bg-neutral-950/60 border border-white/5 flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold tracking-wider text-zinc-500 uppercase">Available Units</span>
                              <span className="text-[11px] font-medium text-zinc-400">
                                Total: {activeStock?.total || 0} | Held: {activeStock?.reserved || 0}
                              </span>
                            </div>

                            {/* Badge conditional logic: Turns amber when available < 5 */}
                            {availableCount >= 5 ? (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-emerald" />
                                IN STOCK ({availableCount})
                              </div>
                            ) : availableCount > 0 ? (
                              // extra Low-stock threshold alerts — badge turns amber when available < 5 units
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide text-amber-400 bg-amber-500/5 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                LOW STOCK ({availableCount})
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide text-rose-400 bg-rose-500/5 border border-rose-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                OUT OF STOCK
                              </div>
                            )}
                          </div>

                          {/* Qty Selector */}
                          {availableCount > 0 && (
                            <div className="flex items-center gap-3">
                              <div className="flex-1 space-y-1.5">
                                <label className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase">
                                  Hold Quantity (1–{availableCount})
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  max={availableCount}
                                  value={qty}
                                  onChange={(e) => {
                                    const val = Math.min(
                                      availableCount, 
                                      Math.max(1, parseInt(e.target.value) || 1)
                                    );
                                    setSelectedQuantity((prev) => ({ ...prev, [product.id]: val }));
                                  }}
                                  className="w-full text-xs font-semibold py-2 px-3 rounded-lg bg-neutral-950 border border-white/10 text-white outline-none focus:border-violet-500/50"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => handleReserve(product.id, product.name)}
                          disabled={availableCount === 0 || submitting[product.id]}
                          className="w-full relative flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-[0_0_20px_rgba(124,58,237,0.15)] hover:shadow-[0_0_30px_rgba(124,58,237,0.35)] transition-all disabled:opacity-30 cursor-pointer"
                        >
                          {submitting[product.id] ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              SECURING DISTRIBUTED LOCK...
                            </>
                          ) : availableCount === 0 ? (
                            "OUT OF SUPPLY"
                          ) : (
                            <>
                              Reserve
                              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                            </>
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            {/* Sidebar */}
            <div className="flex flex-col gap-6">
              
              {/* System State Details */}
              <div className="glass-card rounded-2xl p-6 border border-white/5 flex flex-col gap-6">
                <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-white/5 pb-4">
                  <Database className="w-5 h-5 text-violet-400" />
                  System Statistics
                </h3>

                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-950 border border-white/5">
                    <Activity className="w-5 h-5 text-emerald-400 animate-pulse animate-pulse-emerald" />
                    <div>
                      <span className="text-[10px] block font-bold tracking-wider text-zinc-500 uppercase">Engine Core</span>
                      <span className="text-xs font-bold text-white">Upstash Distributed Lock</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-950 border border-white/5">
                    <Layers className="w-5 h-5 text-violet-400 animate-pulse" />
                    <div>
                      <span className="text-[10px] block font-bold tracking-wider text-zinc-500 uppercase">Conflict Isolation</span>
                      <span className="text-xs font-bold text-white">Prisma Row Isolation</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase block">Active Warehouses</span>
                  <div className="space-y-2">
                    {warehouses.map((w) => (
                      <div key={w.id} className="flex justify-between items-center text-xs p-2.5 rounded-lg bg-neutral-950/60 border border-white/5">
                        <span className="font-semibold text-white">{w.name}</span>
                        <span className="text-[10px] text-zinc-400 font-bold bg-neutral-900 border border-white/10 px-2 py-0.5 rounded-md font-mono">
                          {w.region}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 text-[10px] leading-relaxed text-zinc-400 font-medium">
                  Dual lazy cleanup audits run automatically upon catalog read actions, in parallel with minute-by-minute Vercel crons.
                </div>
              </div>

              {/* Concurrency Simulator */}
              <div className="glass-card rounded-2xl p-6 border border-white/5 flex flex-col gap-4 bg-gradient-to-b from-white/[0.01] to-transparent">
                <h3 className="text-xs font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  Testing Concurrency?
                </h3>
                <p className="text-[10px] leading-relaxed text-zinc-400 font-medium">
                  Try opening two duplicate tabs to book a low-stock variant (like a Couples Intimacy Kit) simultaneously.
                </p>
                <p className="text-[10px] leading-relaxed text-zinc-400 font-medium">
                  The race loser is safely blocked, triggering an immediate **409** popup: <span className="text-rose-400">"Not enough stock — this item was just taken."</span>
                </p>
              </div>

            </div>

          </div>
        )}
      </main>

      {/* Floating Animated Toast Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`glass-card p-4 rounded-xl flex items-start gap-3 border shadow-2xl animate-fade-in ${
              t.type === "success" 
                ? "border-emerald-500/20 bg-emerald-950/20 text-white" 
                : t.type === "error"
                ? "border-rose-500/20 bg-rose-950/20 text-white"
                : "border-amber-500/20 bg-amber-950/20 text-white"
            }`}
          >
            {t.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {t.type === "error" && <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />}
            {t.type === "warning" && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />}
            
            <div className="flex-1">
              <span className="text-xs font-semibold block uppercase tracking-wider text-zinc-400 mb-1">
                {t.type === "success" ? "System Success" : t.type === "error" ? "System Conflict" : "System Alert"}
              </span>
              <p className="text-xs font-semibold text-zinc-200 leading-normal">{t.message}</p>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
