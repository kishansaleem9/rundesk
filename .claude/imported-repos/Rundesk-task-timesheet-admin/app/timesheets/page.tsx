import type { Metadata } from "next";

import TimesheetsView from "@/components/timesheets/TimesheetsView";

export const metadata: Metadata = {
  title: "Timesheets · Rundesk",
};

/**
 * /timesheets — weekly time tracking against the signed-in user's tasks.
 * The chat shell locks html/body scrolling, so the view scrolls itself.
 */
export default function TimesheetsPage() {
  return <TimesheetsView />;
}
