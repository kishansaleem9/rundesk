# SYNC NOW GOES THROUGH ONLY THE TASKS ALREADY WRITTEN, not those its syncs hold.
# (`ledger-rows/row-1904`)
# Reddens: planner-sync-now: "and it writes a task the sync holds that was never pushed — made by an import, not through the product"
#   or "Sync now writes only the presser’s calendars: the colleague’s deleted event stays deleted after the member’s press, and their own press writes it again with the task never pushed, answering how many tasks it went through"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    for (const rule of rules) for (const id of await this.datedTasksOf(rule.scopeType, rule.scopeId)) taskIds.add(id)\n',
     "    void rules // BROKEN: the syncs' places are not read\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('psn-3-sync-now-reads-no-syncs: sync now reads no syncs')
