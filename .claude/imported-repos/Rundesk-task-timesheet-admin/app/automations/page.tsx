/**
 * /automations — ClickUp-style project view with the automation panel.
 * Uses the demo workspace and mock data (see README for switching to MySQL).
 */

import { ProjectView } from "@/components/project/ProjectView";
import { DEMO_WORKSPACE_ID } from "@/lib/automation/taskStore";

export const metadata = { title: "Project 1 · Rundesk" };

export default function AutomationsPage() {
  // The chat shell locks html/body to overflow:hidden and a light theme; this
  // wrapper gives the automations view its own dark, scrollable viewport.
  return (
    <div className="h-screen overflow-auto bg-ink text-fg antialiased">
      <ProjectView workspaceId={DEMO_WORKSPACE_ID} />
    </div>
  );
}
