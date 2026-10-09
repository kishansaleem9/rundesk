# SYNC NOW READS THE CALENDARS' EVENTS AGAIN NOWHERE.
# (`ledger-rows/row-1904`)
# Reddens: planner-sync-now: "an event added to the member’s calendar after the planner drew the week is drawn once Sync now is pressed"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        qc.invalidateQueries({ queryKey: ['planner-events', workspaceId] }),\n        qc.invalidateQueries({ queryKey: ['planner-blocks', workspaceId] }),\n      ])\n      if (done.failed > 0)",
     "        qc.invalidateQueries({ queryKey: ['planner-blocks', workspaceId] }), // BROKEN: the events are not read again\n      ])\n      if (done.failed > 0)"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('psn-w2-the-events-are-not-read-again: the events are not read again')
