/**
 * Dependency selection for the engine.
 *
 *   AUTOMATION_REPO=memory  (default) → in-memory workflows + mock tasks, no DB
 *   AUTOMATION_REPO=prisma            → workflows/runs in MySQL via Prisma,
 *                                       tasks still mocked (Rundesk's real task
 *                                       tables aren't part of this prototype)
 *
 * The Prisma module is imported lazily so the memory mode never needs a
 * generated Prisma client.
 */

import type { EngineDeps } from "./engine";
import { getMemoryRepository } from "./repositories/memoryRepository";
import { getMemoryTaskStore } from "./taskStore";

export async function getDeps(): Promise<EngineDeps> {
  const mode = process.env.AUTOMATION_REPO ?? "memory";

  if (mode === "prisma") {
    const { getPrismaRepository } = await import("./repositories/prismaRepository");
    return { repo: getPrismaRepository(), taskStore: getMemoryTaskStore() };
  }

  return { repo: getMemoryRepository(), taskStore: getMemoryTaskStore() };
}
