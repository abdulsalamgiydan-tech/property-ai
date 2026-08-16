import { NextResponse } from "next/server";

export function serverErrorResponse() {
  return NextResponse.json({ error: "server error" }, { status: 500 });
}
