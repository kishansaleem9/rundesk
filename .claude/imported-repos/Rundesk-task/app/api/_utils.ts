/** Small helpers shared by the automation API routes. */

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

/** Turn thrown errors (Zod or otherwise) into a consistent JSON error response. */
export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return fail("Validation failed", 422, err.issues);
  }
  console.error("[automation api]", err);
  return fail(err instanceof Error ? err.message : "Internal error", 500);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}
