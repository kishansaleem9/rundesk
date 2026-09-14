import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AccessError } from "./access";

export function apiError(error: unknown) {
  console.error(error);

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid request",
        issues: error.issues,
      },
      { status: 400 },
    );
  }

  if (error instanceof AccessError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  if (
    error instanceof Error &&
    error.message.includes("not found")
  ) {
    return NextResponse.json(
      { error: error.message },
      { status: 404 },
    );
  }

  if (
    error instanceof Error &&
    error.message.includes("DATABASE_URL")
  ) {
    return NextResponse.json(
      { error: error.message },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
