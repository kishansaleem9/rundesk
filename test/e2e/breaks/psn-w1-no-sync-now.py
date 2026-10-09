# THE PLANNER HAS NO SYNC NOW.
# (`ledger-rows/row-1904`)
# Reddens: planner-sync-now: "the planner’s header has Sync now beside its settings, as frame 14:36 draws its circular arrows beside the ⚙"
#   or "an event added to the member’s calendar after the planner drew the week is drawn once Sync now is pressed"
#   or "Sync now writes a synced task’s event again where it was deleted from the member’s calendar, and puts back as the task says one the calendar changed"
#   or "and it writes a task the sync holds that was never pushed — made by an import, not through the product"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 2 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('            data-testid="planner-sync-now"\n',
     '            data-testid="planner-sync-now-gone" hidden\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('psn-w1-no-sync-now: no sync now')
