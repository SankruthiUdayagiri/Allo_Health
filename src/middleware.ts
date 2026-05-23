import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const start = Date.now();
  const method = req.method;
  const path = req.nextUrl.pathname;

  const res = NextResponse.next();
  const duration = Date.now() - start;

  // structured JSON log to console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "http_request",
    method,
    path,
    durationMs: duration,
    status: res.status,
  }));

  return res;
}

export const config = {
  matcher: "/api/:path*",
};
