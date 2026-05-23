import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";

export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany();
    return NextResponse.json({ warehouses });
  } catch (error) {
    console.error("GET /api/warehouses error:", error);
    return NextResponse.json({ error: "Failed to fetch warehouses" }, { status: 500 });
  }
}
export const dynamic = "force-dynamic";
