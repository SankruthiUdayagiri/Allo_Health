"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { 
  CheckCircle, 
  MapPin, 
  ShoppingBag, 
  ArrowRight, 
  Calendar,
  Lock,
  Printer
} from "lucide-react";

interface Product {
  name: string;
  sku: string;
  price: number;
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
  status: string;
  confirmedAt?: string;
  product: Product;
  warehouse: Warehouse;
}

export default function OrderConfirmation() {
  const { id } = useParams() as { id: string };
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/reservations/${id}`);
        if (res.ok) {
          const data = await res.json();
          setReservation(data.reservation);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-white bg-[#030307]">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-sm text-gray-400">Decrypting order ledger...</p>
      </div>
    );
  }

  if (!reservation || reservation.status !== "CONFIRMED") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-white bg-[#030307]">
        <h1 className="text-xl font-bold">Receipt Not Available</h1>
        <p className="mt-2 text-gray-400 text-sm">This order is either pending hold or has not been confirmed.</p>
        <Link href="/" className="mt-6 px-5 py-2.5 text-sm font-semibold bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors">
          Return to Hub
        </Link>
      </div>
    );
  }

  const unitPrice = reservation.product.price || 1499;
  const totalPrice = unitPrice * reservation.quantity;

  return (
    <div className="relative min-h-screen pb-24 text-white bg-[#030307] flex items-center justify-center px-4">
      {/* Background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] bg-glow-emerald -z-10 rounded-full" />

      <div className="w-full max-w-xl border border-white/10 bg-[#08080f]/90 backdrop-blur-2xl rounded-3xl p-8 shadow-[0_20px_50px_rgba(16,185,129,0.15)] relative overflow-hidden">
        {/* Receipt aesthetic details */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 to-teal-400" />

        <div className="flex flex-col items-center text-center mt-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-4 animate-bounce">
            <CheckCircle className="w-8 h-8" />
          </div>
          
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Ledger Block Verified</span>
          <h1 className="text-2xl font-black mt-2">Order Confirmed!</h1>
          <p className="text-sm text-gray-400 mt-1">Transaction completed with 100% database lock accuracy.</p>
        </div>

        {/* Receipt Container */}
        <div className="mt-8 border-t border-dashed border-white/10 pt-6">
          <div className="flex justify-between items-center text-xs font-mono text-gray-400 mb-6">
            <span>RECEIPT ID: {reservation.id.substring(0, 8).toUpperCase()}-{reservation.id.substring(9, 13).toUpperCase()}</span>
            <span>{reservation.confirmedAt ? new Date(reservation.confirmedAt).toLocaleDateString() : new Date().toLocaleDateString()}</span>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs text-gray-400 font-medium">Product Name</span>
                <p className="font-semibold text-white mt-0.5">{reservation.product.name}</p>
                <span className="text-xs font-mono text-gray-400 block mt-0.5">{reservation.product.sku}</span>
              </div>
              <span className="text-sm font-semibold font-mono">₹{unitPrice.toLocaleString()}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-y border-white/5">
              <span className="text-xs text-gray-400">Hold Units Finalized</span>
              <span className="text-sm font-bold font-mono text-gray-300">× {reservation.quantity}</span>
            </div>

            <div className="flex justify-between items-center py-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <MapPin className="w-3.5 h-3.5" />
                <span>Shipping Facility</span>
              </div>
              <span className="text-xs font-medium text-gray-200">{reservation.warehouse.name}</span>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-white/10">
              <span className="text-base font-bold">Grand Total Paid</span>
              <span className="text-xl font-black font-mono text-emerald-400">₹{totalPrice.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row gap-4">
          <button 
            onClick={() => window.print()}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-semibold transition-all"
          >
            <Printer className="w-4 h-4" />
            Print Invoice
          </button>
          
          <Link 
            href="/"
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-sm font-bold shadow-[0_4px_15px_rgba(124,58,237,0.3)] hover:shadow-[0_4px_25px_rgba(124,58,237,0.5)] transition-all"
          >
            Continue Hub
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
