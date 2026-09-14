import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/current-user";
import { apiError } from "@/lib/server/http";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain", "text/csv", "application/zip", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "audio/webm", "audio/ogg", "audio/mpeg", "audio/wav", "audio/mp4"]);
export async function POST(request: NextRequest) {
  try { await getCurrentUser(); const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) return NextResponse.json({ error: "A file is required" }, { status: 400 }); if (file.size > MAX_SIZE) return NextResponse.json({ error: "Files must be 10 MB or smaller" }, { status: 413 }); if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Unsupported file type" }, { status: 415 }); const extension = path.extname(file.name).toLowerCase(); const storageKey = `${crypto.randomUUID()}${extension}`; const directory = path.join(process.cwd(), "storage", "uploads"); await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, storageKey), Buffer.from(await file.arrayBuffer())); return NextResponse.json({ originalName: file.name, storageKey, mimeType: file.type, size: file.size, url: `/api/upload/${storageKey}`, storage: "local-development" }, { status: 201 }); } catch (error) { return apiError(error); }
}
