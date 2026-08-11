import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/google", "/api/auth/me", "/api/auth/signup", "/join", "/api/join", "/onboarding", "/api/onboarding/claim"];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("fep_token")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  try {
    const secretKey = new TextEncoder().encode(
      process.env.JWT_SECRET || "dev-secret-change-me"
    );
    const { payload } = await jwtVerify(token, secretKey);
    let role = payload.role as string;
    if (role === "fep_faculty") role = "eduskill_faculty";
    if (role === "fep_manager") role = "eduskill_manager";
    if (role === "fep_admin") role = "eduskill_admin";

    // Role-scoped protections (viewers browse manager views read-only)
    if (pathname.startsWith("/admin") && role !== "eduskill_admin") {
      const url = req.nextUrl.clone();
      url.pathname = role === "eduskill_manager" || role === "eduskill_viewer" ? "/manager" : "/faculty";
      return NextResponse.redirect(url);
    }
    if (pathname.startsWith("/manager") && role !== "eduskill_manager" && role !== "eduskill_admin" && role !== "eduskill_viewer") {
      const url = req.nextUrl.clone();
      url.pathname = "/faculty";
      return NextResponse.redirect(url);
    }
    if (pathname.startsWith("/faculty") && (role === "eduskill_manager" || role === "eduskill_viewer")) {
      const url = req.nextUrl.clone();
      url.pathname = "/manager";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  } catch (err: any) {
    console.error("JWT verification failed in proxy for token:", token);
    console.error("JWT verification failed in proxy:", err.message || err);
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    const res = NextResponse.redirect(url);
    res.cookies.delete("fep_token");
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
