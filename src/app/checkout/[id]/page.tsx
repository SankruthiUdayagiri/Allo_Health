"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Lock, 
  MapPin, 
  ArrowLeft, 
  CheckCircle2, 
  XCircle, 
  CreditCard,
  AlertTriangle,
  RefreshCw,
  Clock,
  Sparkles,
  ShoppingBag
} from "lucide-react";

interface Product {
  sku: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
}

interface Warehouse {
  name: string;
  location: string;
}

interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED" | string;
  expiresAt: string;
  product: Product;
  warehouse: Warehouse;
}

interface CheckoutPageProps {
  params: Promise<{ id: string }>;
}

export default function CheckoutPage({ params }: CheckoutPageProps) {
  const { id } = use(params);
  const router = useRouter();
  
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  
  const [timeLeft, setTimeLeft] = useState<number>(600); // 10 minutes (600s) default
  const [isExpired, setIsExpired] = useState(false);
  
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    title: string;
    text: string;
  } | null>(null);

  // Circular ring properties
  const circleRadius = 50;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * circleRadius;

  const fetchReservation = async () => {
    try {
      const res = await fetch(`/api/reservations/${id}`);
      const data = await res.json();
      
      if (res.ok && data.reservation) {
        setReservation(data.reservation);
        
        const expiresAt = new Date(data.reservation.expiresAt).getTime();
        const now = new Date().getTime();
        const diffSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
        
        if (data.reservation.status === "CONFIRMED") {
          setStatusMessage({
            type: "success",
            title: "Secured & Finalized",
            text: "This allocation has been permanently finalized and billed.",
          });
          setTimeLeft(0);
        } else if (data.reservation.status === "RELEASED" || diffSeconds <= 0) {
          setIsExpired(true);
          setTimeLeft(0);
        } else {
          setTimeLeft(diffSeconds);
        }
      } else {
        setStatusMessage({
          type: "error",
          title: "Hold Not Found",
          text: data.error || "This supply hold does not exist or was cleared.",
        });
      }
    } catch (err) {
      console.error(err);
      setStatusMessage({
        type: "error",
        title: "Connection Failed",
        text: "Unable to retrieve reservation hold details.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservation();
  }, [id]);

  // Live expiry countdown
  useEffect(() => {
    if (timeLeft <= 0 || isExpired || loading || statusMessage) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsExpired(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, isExpired, loading, statusMessage]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = Math.min(1, timeLeft / 600);
  const strokeDashoffset = circumference - progress * circumference;

  // Determine countdown colors based on exact spec: Turns RED under 2 minutes (< 120s)
  const getTimerColors = () => {
    if (timeLeft >= 300) { // Green for 5+ minutes
      return {
        text: "text-emerald-400",
        stroke: "stroke-emerald-500",
        border: "border-emerald-500/20 bg-emerald-500/5",
        ring: "shadow-[0_0_20px_rgba(16,185,129,0.2)]",
      };
    }
    if (timeLeft >= 120) { // Amber for 2 to 5 minutes
      return {
        text: "text-amber-400",
        stroke: "stroke-amber-500",
        border: "border-amber-500/20 bg-amber-500/5",
        ring: "shadow-[0_0_20px_rgba(245,158,11,0.2)]",
      };
    }
    // turns red at <2 minutes required
    return {
      text: "text-rose-500 animate-pulse font-extrabold",
      stroke: "stroke-rose-600",
      border: "border-rose-500/30 bg-rose-950/20",
      ring: "shadow-[0_0_30px_rgba(239,68,68,0.45)] animate-pulse-rose",
    };
  };

  const colors = getTimerColors();

  // Complete Order
  const handleConfirm = async () => {
    if (timeLeft <= 0 || isExpired || !reservation) return;
    
    setConfirming(true);
    const idempotencyKey = `idemp_confirm_${reservation.id}`;

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": idempotencyKey,
        },
      });

      const data = await res.json();

      if (res.ok) {
        setStatusMessage({
          type: "success",
          title: "Hold Permanently Confirmed",
          text: `Payment simulated successfully for ₹${reservation.product.price.toLocaleString("en-IN")}. Your stock is finalized and heading for shipment from ${reservation.warehouse.name}!`,
        });
        setReservation((prev) => prev ? { ...prev, status: "CONFIRMED" } : null);
      } else {
        setStatusMessage({
          type: "error",
          title: "Confirmation Failed",
          text: data.message || "Transaction declined by inventory ledger.",
        });
      }
    } catch (err) {
      console.error(err);
      alert("Failed to confirm transaction. Please check connection.");
    } finally {
      setConfirming(false);
    }
  };

  // Cancel Hold (Release stock immediately and redirect to catalog with query toast trigger)
  const handleCancel = async () => {
    if (!reservation) return;
    setCancelling(true);

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });

      if (res.ok) {
        // Redirect back to listing with cancelled parameter to show toast notification
        router.push("/?cancelled=true");
      } else {
        alert("Unable to release reservation. Hold remains active.");
      }
    } catch (err) {
      console.error(err);
      alert("Network timeout while releasing hold.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="relative min-h-screen pb-24 overflow-hidden bg-[#030307] text-[#f4f4f7]">
      {/* Glow Rings */}
      <div className="absolute top-0 left-1/4 w-[40vw] h-[40vw] bg-glow-purple -z-10 rounded-full" />
      <div className="absolute bottom-0 right-1/4 w-[40vw] h-[40vw] bg-glow-emerald -z-10 rounded-full" />

      {/* Nav */}
      <header className="w-full border-b border-white/5 bg-[#030307]/75 backdrop-blur-md">
        <div className="flex items-center justify-between max-w-5xl h-20 px-6 mx-auto">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white">ALLO</span>
              <span className="text-xs block text-violet-400 font-semibold tracking-wider uppercase -mt-1">Billing Terminal</span>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors uppercase tracking-wider"
          >
            <ArrowLeft className="w-4 h-4" />
            BACK TO CATALOG
          </Link>
        </div>
      </header>

      {/* Grid wrapper */}
      <main className="max-w-4xl px-6 mx-auto mt-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 gap-4">
            <div className="relative w-12 h-12 rounded-full border-2 border-white/5 border-t-violet-500 animate-spin" />
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Accessing secure hold...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start">
            
            {/* Summary card section */}
            <div className="md:col-span-3 flex flex-col gap-6">
              
              {/* Active form hold */}
              {reservation && !statusMessage && !isExpired && (
                <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-6">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-white/5 pb-4">
                    <Lock className="w-4 text-violet-400" />
                    Reservation Summary
                  </h2>

                  <div className="flex gap-4">
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-neutral-900 border border-white/10 shrink-0">
                      <img 
                        src={reservation.product.imageUrl} 
                        alt={reservation.product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white leading-normal">
                          {reservation.product.name}
                        </h3>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mt-1">
                          SKU: {reservation.product.sku}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-zinc-400">
                        Quantity: {reservation.quantity} Unit(s)
                      </span>
                    </div>
                  </div>

                  {/* Distribution Hub Card */}
                  <div className="p-4 rounded-xl bg-neutral-950 border border-white/5 space-y-2">
                    <span className="text-[9px] font-black text-violet-400 tracking-widest uppercase block">Distribution Center</span>
                    <div className="flex items-start gap-2.5">
                      <MapPin className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-white leading-none mb-1">
                          {reservation.warehouse.name}
                        </h4>
                        <span className="text-[10px] text-zinc-400 font-medium">
                          {reservation.warehouse.location}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cost Calculator */}
                  <div className="pt-4 border-t border-white/5 space-y-3">
                    <div className="flex justify-between text-xs font-semibold text-zinc-400">
                      <span>Unit Price</span>
                      <span>₹{reservation.product.price.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-zinc-400">
                      <span>Reserve Lock Fee</span>
                      <span className="text-emerald-400">₹0.00 (Waived)</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-white/5">
                      <span>Total Invoice</span>
                      <span className="font-mono text-violet-400">₹{(reservation.product.price * reservation.quantity).toLocaleString("en-IN")}</span>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="pt-4 space-y-3">
                    <button
                      onClick={handleConfirm}
                      disabled={confirming}
                      className="w-full relative flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-[0_0_20px_rgba(124,58,237,0.2)] hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {confirming ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          CONFIRMING RESERVATION HOLD...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          Confirm Purchase
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-rose-400 hover:text-white hover:bg-rose-950/20 transition-all border border-transparent hover:border-rose-500/20 disabled:opacity-50 cursor-pointer"
                    >
                      {cancelling ? "ABORTING HOLD..." : "Cancel Reservation"}
                    </button>
                  </div>
                </div>
              )}

              {/* Expired state alert */}
              {isExpired && !statusMessage && (
                <div className="glass-card rounded-2xl p-8 border border-white/5 flex flex-col items-center text-center gap-6">
                  <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.2)]">
                    <XCircle className="w-8 h-8" />
                  </div>

                  <div className="space-y-2">
                    {/* Explicit 410 Expired Banner State */}
                    <div className="px-4 py-1.5 rounded-lg bg-rose-950/30 border border-rose-500/20 text-rose-400 text-xs font-extrabold uppercase tracking-widest inline-block">
                      This reservation expired
                    </div>
                    <h2 className="text-xl font-bold text-white mt-4">Hold Allocation Expired</h2>
                    <p className="text-xs leading-relaxed text-zinc-400 max-w-sm mx-auto font-medium">
                      Your high-concurrency inventory reservation has hit the 10-minute timeout. Stock levels have been safely released to prevent catalog leakage.
                    </p>
                  </div>

                  {/* Try Again CTA */}
                  <Link
                    href="/"
                    className="flex items-center gap-2 py-3.5 px-8 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-[0_0_20px_rgba(124,58,237,0.2)] hover:shadow-[0_0_30px_rgba(124,58,237,0.45)] transition-all"
                  >
                    Try Again
                    <ArrowLeft className="w-4 h-4 rotate-180" />
                  </Link>
                </div>
              )}

              {/* Success Screen Card */}
              {statusMessage && (
                <div className="glass-card rounded-2xl p-8 border border-white/5 flex flex-col items-center text-center gap-6">
                  {statusMessage.type === "success" ? (
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.2)]">
                      <XCircle className="w-8 h-8" />
                    </div>
                  )}

                  <div className="space-y-2">
                    <h2 className="text-xl font-bold text-white">
                      {statusMessage.title}
                    </h2>
                    <p className="text-xs leading-relaxed text-zinc-400 max-w-sm mx-auto font-medium">
                      {statusMessage.text}
                    </p>
                  </div>

                  {statusMessage.type === "success" && (
                    <Link
                      href={`/order/${id}`}
                      className="flex items-center gap-2 py-3 px-6 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-[0_0_20px_rgba(16,185,129,0.25)] hover:shadow-[0_0_30px_rgba(16,185,129,0.45)] hover:-translate-y-0.5 transition-all"
                    >
                      View Receipt Invoice
                      <ShoppingBag className="w-4 h-4" />
                    </Link>
                  )}

                  {statusMessage.type === "error" && (
                    <Link
                      href="/"
                      className="flex items-center gap-2 py-3 px-6 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-tr from-violet-600 to-indigo-500"
                    >
                      Return to Hub
                      <ArrowLeft className="w-4 h-4 rotate-180" />
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Timer column */}
            <div className="md:col-span-2 flex flex-col gap-6">
              
              {/* Circular Expiry Dial */}
              <div className="glass-card rounded-2xl p-6 border border-white/5 flex flex-col items-center text-center gap-6">
                <div className="w-full flex items-center justify-between border-b border-white/5 pb-4">
                  <span className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-violet-400" />
                    Hold Lock Expiry
                  </span>
                  
                  <div className="flex h-2 w-2 relative">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${timeLeft >= 120 ? "bg-emerald-400" : "bg-rose-400"}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${timeLeft >= 120 ? "bg-emerald-500" : "bg-rose-500"}`}></span>
                  </div>
                </div>

                <div className="relative flex items-center justify-center w-40 h-40">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="80"
                      cy="80"
                      r={circleRadius}
                      className="stroke-neutral-900 fill-none"
                      strokeWidth={strokeWidth}
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r={circleRadius}
                      className={`fill-none transition-all duration-1000 ease-linear ${colors.stroke}`}
                      strokeWidth={strokeWidth}
                      strokeDasharray={circumference}
                      strokeDashoffset={isExpired ? circumference : strokeDashoffset}
                      strokeLinecap="round"
                    />
                  </svg>
                  
                  <div className="absolute flex flex-col items-center">
                    <span className={`text-2xl font-black font-mono tracking-tighter ${colors.text}`}>
                      {isExpired ? "00:00" : formatTime(timeLeft)}
                    </span>
                    <span className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest mt-0.5">
                      {isExpired ? "RELEASED" : "REMAINING"}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] leading-relaxed text-zinc-400 max-w-[200px] font-medium">
                  {isExpired 
                    ? "Lock expired. Stock levels reclaimed by fulfillment depots."
                    : timeLeft >= 120 
                    ? "Items are safely reserved for your purchase."
                    : "WARNING: Complete checkout immediately before stock allocation drops!"}
                </div>
              </div>

              {/* Idempotent Shield */}
              <div className="p-4 rounded-2xl border border-white/5 bg-neutral-950/60 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white mb-0.5">Idempotency Guarded</h4>
                  <p className="text-[10px] leading-relaxed text-zinc-500 font-medium">
                    This terminal operates with dual-token idempotency locks, guaranteeing zero double billing if connection lags occur.
                  </p>
                </div>
              </div>

            </div>

          </div>
        )}
      </main>

    </div>
  );
}
