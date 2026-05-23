"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ShieldAlert, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ArrowLeft,
  Server,
  Layers,
  Database
} from "lucide-react";

interface Product {
  name: string;
  sku: string;
}

interface Warehouse {
  name: string;
  location: string;
}

interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: string;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  confirmedAt?: string;
  releasedAt?: string;
  idempotencyKey?: string;
  product: Product;
  warehouse: Warehouse;
}

export default function AdminDashboard() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "CONFIRMED" | "RELEASED">("ALL");
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<Record<string, boolean>>({});

  const loadReservations = async () => {
    try {
      const res = await fetch("/api/admin/reservations");
      if (res.ok) {
        const data = await res.json();
        setReservations(data.reservations || []);
      }
    } catch (err) {
      console.error("Failed to load admin reservations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReservations();
    const interval = setInterval(loadReservations, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRelease = async (id: string) => {
    setReleasing((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: "POST",
      });
      if (res.ok) {
        await loadReservations();
      }
    } catch (err) {
      console.error("Release error:", err);
    } finally {
      setReleasing((prev) => ({ ...prev, [id]: false }));
    }
  };

  const filteredList = reservations.filter(r => filter === "ALL" || r.status === filter);

  // Compute metrics
  const activeCount = reservations.filter(r => r.status === "PENDING" && new Date(r.expiresAt) > new Date()).length;
  const confirmedCount = reservations.filter(r => r.status === "CONFIRMED").length;
  const releasedCount = reservations.filter(r => r.status === "RELEASED").length;

  return (
    <div className="relative min-h-screen pb-24 text-white bg-[#030307]">
      {/* Glow Effects */}
      <div className="absolute top-0 right-0 w-[45vw] h-[45vw] bg-glow-purple -z-10 rounded-full" />
      <div className="absolute bottom-1/4 left-0 w-[45vw] h-[45vw] bg-glow-emerald -z-10 rounded-full" />

      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#030307]/75 backdrop-blur-md">
        <div className="flex items-center justify-between max-w-7xl h-20 px-6 mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight">ALLO</span>
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-violet-600/30 text-violet-400 border border-violet-500/20">
                CONTROL PANEL
              </span>
            </div>
          </div>
          
          <button 
            onClick={loadReservations}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Sync Ledger
          </button>
        </div>
      </header>

      <main className="max-w-7xl px-6 mx-auto mt-12">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
            Intelligent Inventory Control Room
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Monitor real-time distributed transaction logs, locks, and seed states.
          </p>
        </div>

        {/* System Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Active holds card */}
          <div className="relative p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
            <div className="flex justify-between items-start mb-4">
              <span className="text-sm font-medium text-gray-400">Active Reservoir Holds</span>
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black">{activeCount}</div>
            <p className="text-xs text-gray-400 mt-2">Locked units awaiting customer checkout</p>
          </div>

          {/* Confirmed sales card */}
          <div className="relative p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
            <div className="flex justify-between items-start mb-4">
              <span className="text-sm font-medium text-gray-400">Confirmed Deliveries</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black">{confirmedCount}</div>
            <p className="text-xs text-gray-400 mt-2">Permanently decremented from warehouse stocks</p>
          </div>

          {/* Expired/released card */}
          <div className="relative p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
            <div className="flex justify-between items-start mb-4">
              <span className="text-sm font-medium text-gray-400">Reclaimed / Released holds</span>
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <XCircle className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black">{releasedCount}</div>
            <p className="text-xs text-gray-400 mt-2">Returned instantly to active inventory catalog</p>
          </div>
        </div>

        {/* Reservation Ledger */}
        <div className="border border-white/5 bg-[#08080f]/80 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 border-b border-white/5 bg-white/[0.02]">
            <span className="font-semibold text-lg">Transaction Ledger Logs</span>

            <div className="flex items-center gap-2 p-1 rounded-lg border border-white/5 bg-white/5">
              {(["ALL", "PENDING", "CONFIRMED", "RELEASED"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    filter === s 
                      ? "bg-violet-600 text-white" 
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" />
                Loading ledger streams...
              </div>
            ) : filteredList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <Server className="w-12 h-12 mb-3 text-white/10" />
                No transaction logs match current filters.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.01] text-gray-400 text-xs font-medium uppercase tracking-wider">
                    <th className="px-6 py-4">Product Details</th>
                    <th className="px-6 py-4">Fulfillment Facility</th>
                    <th className="px-6 py-4">Quantity</th>
                    <th className="px-6 py-4">Status State</th>
                    <th className="px-6 py-4">Expiry / Timestamp</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredList.map((res) => {
                    const isExpired = new Date() > new Date(res.expiresAt);
                    return (
                      <tr key={res.id} className="hover:bg-white/[0.01] transition-colors text-sm">
                        <td className="px-6 py-4">
                          <div className="font-semibold">{res.product.name}</div>
                          <div className="text-xs text-gray-400 font-mono">{res.product.sku}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div>{res.warehouse.name}</div>
                          <div className="text-xs text-gray-400">{res.warehouse.location}</div>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-gray-300">
                          {res.quantity}
                        </td>
                        <td className="px-6 py-4">
                          {res.status === "CONFIRMED" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-emerald-500/10 bg-emerald-500/5 text-emerald-400 text-xs font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              CONFIRMED
                            </span>
                          )}
                          {res.status === "RELEASED" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-rose-500/10 bg-rose-500/5 text-rose-400 text-xs font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              RELEASED
                            </span>
                          )}
                          {res.status === "PENDING" && !isExpired && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-amber-500/10 bg-amber-500/5 text-amber-400 text-xs font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              PENDING HOLD
                            </span>
                          )}
                          {res.status === "PENDING" && isExpired && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-rose-500/10 bg-rose-500/5 text-rose-400 text-xs font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                              EXPIRED
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-gray-400">
                          {res.status === "PENDING" ? (
                            <div>
                              Hold Expires: {new Date(res.expiresAt).toLocaleTimeString()}
                            </div>
                          ) : res.status === "CONFIRMED" ? (
                            <div>
                              Sold: {res.confirmedAt ? new Date(res.confirmedAt).toLocaleTimeString() : "N/A"}
                            </div>
                          ) : (
                            <div>
                              Released: {res.releasedAt ? new Date(res.releasedAt).toLocaleTimeString() : "N/A"}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {res.status === "PENDING" ? (
                            <button
                              onClick={() => handleManualRelease(res.id)}
                              disabled={releasing[res.id]}
                              className="px-3 py-1.5 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-colors"
                            >
                              {releasing[res.id] ? "Releasing..." : "Release Hold"}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-500 font-medium">Terminal State</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
