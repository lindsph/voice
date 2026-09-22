import { NextResponse, type NextRequest } from "next/server";

import { productionServesPath } from "@/lib/public-surface";

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();
  if (productionServesPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  return new NextResponse(null, { status: 404 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
