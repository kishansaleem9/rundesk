import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  PrismaClient,
  WorkspaceRole,
} from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const db = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
});

const WORKSPACE_ID = "aura-agency";
const WORKSPACE_NAME = "AURA";

function shouldResetWorkspaceData() {
  return (
    process.env.RESET_RUNDESK_DATA?.trim().toLowerCase() ===
    "true"
  );
}

async function main() {
  const email =
    process.env.DEV_USER_EMAIL ??
    "munazza@aura.local";

  const name =
    process.env.DEV_USER_NAME ??
    "Workspace Owner";

  /*
   * Keep exactly one development/current user.
   * We do not delete the User table because those records may be
   * referenced elsewhere. The UI only exposes users who belong to
   * the active workspace.
   */
  const user = await db.user.upsert({
    where: { email },
    update: { name },
    create: {
      name,
      email,
    },
  });

  if (shouldResetWorkspaceData()) {
    /*
     * Remove all memberships for the current dev user first so the
     * bootstrap route cannot accidentally select an older workspace.
     */
    await db.workspaceMember.deleteMany({
      where: {
        userId: user.id,
      },
    });

    /*
     * Deleting the Rundesk workspace clears its channels, channel
     * memberships, messages, conversations, tasks and whiteboards
     * through the cascade relations in schema.prisma.
     *
     * Other User records are intentionally left alone, but because
     * their AURA workspace memberships are deleted with the workspace,
     * they no longer appear in Chat, DMs, member pickers or tasks.
     */
    const existingWorkspace =
      await db.workspace.findUnique({
        where: {
          id: WORKSPACE_ID,
        },
        select: {
          id: true,
        },
      });

    if (existingWorkspace) {
      await db.workspace.delete({
        where: {
          id: WORKSPACE_ID,
        },
      });
    }

    console.log(
      "Cleared Rundesk workspace data: channels, messages, DMs, tasks, members and whiteboards.",
    );
  }

  const workspace = await db.workspace.upsert({
    where: {
      id: WORKSPACE_ID,
    },
    update: {
      name: WORKSPACE_NAME,
    },
    create: {
      id: WORKSPACE_ID,
      name: WORKSPACE_NAME,
    },
  });

  await db.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: {
      role: WorkspaceRole.OWNER,
    },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: WorkspaceRole.OWNER,
    },
  });

  console.log(
    `Rundesk is ready with an empty workspace for ${email}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
