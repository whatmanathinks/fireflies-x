import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function unauthorized() {
  return fail("Unauthorized", 401);
}

export function isInternalRequest(request: Request) {
  const url = new URL(request.url);
  const secret =
    url.searchParams.get("secret") ??
    request.headers.get("x-internal-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret && secret === env.internalSecret) return true;
  return !!request.headers.get("x-vercel-cron");
}

export async function handle<T>(fn: () => Promise<T>) {
  try {
    return ok(await fn());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHENTICATED") return unauthorized();
    if (/not found$/i.test(message)) return fail(message, 404);
    console.error("[api]", message);
    return fail(message, 500);
  }
}
