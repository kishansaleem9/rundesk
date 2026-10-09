# THE AUTOMATIONS PAGE DRAWS NOTHING.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "nothing syncs until a sync is added: a dated task’s push writes to no calendar — not the member’s own, which no sync names, nor the workspace’s connected Google Calendar — and the Automations page says to pick a list, folder, or space, offering + Add sync"
#   or "the member adds a sync of a folder on the Automations page — the folder, their calendar, all tasks — and it is listed, naming the folder and the calendar"
#   or "removing the sync on the page takes its events off the calendar, and a change to a task there afterwards writes nothing"
#   or "the tasks already in the folder are written to that calendar once the sync is made: a task due at a time is the hour before it, under its name — and an undated one is not"
#   or "a task made there afterwards with a due day and no time is that day’s event"
#   or "renaming a task and moving its due time changes its event — the same event, not a second — and a change the event does not show writes nothing"
#   or "a task in a place no sync holds is not written; moved out of the folder its event comes off, and moved back it is written again"
#   or "a task whose due date is cleared comes off the calendar, and so does an archived one"
#   or "a place the member may not open is refused, saying so — a private space they are not in, 403 — one that is not there is 404, a colleague’s calendar is not found, the same place twice to one calendar is refused; and the member is shown their own syncs alone"
#   or "once the member has left the workspace their sync writes nothing more — the task it held comes off their calendar when it changes — and their syncs are kept, not deleted"
#
# Re-aimed 8 October: the last 7 of these are knock-ons of the same edit, measured on lane 2 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("              <PlannerSyncPage workspaceId={workspaceId} onGoToAccounts={() => setPage('accounts')} />\n",
     '              <div data-broken="the page draws nothing" />\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-w1-the-page-draws-nothing: the page draws nothing')
