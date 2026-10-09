# SYNC NOW WRITES NOTHING THAT LOOKS UNCHANGED: an event deleted or changed in the calendar stays so.
# (`ledger-rows/row-1904`)
# Reddens: planner-sync-now: "Sync now writes a synced task’s event again where it was deleted from the member’s calendar, and puts back as the task says one the calendar changed"
#   or "Sync now writes only the presser’s calendars: the colleague’s deleted event stays deleted after the member’s press, and their own press writes it again with the task never pushed, answering how many tasks it went through"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (row && row.fingerprint === w.fingerprint && !force) {\n',
     '    if (row && row.fingerprint === w.fingerprint) { // BROKEN: Sync now forces nothing\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('psn-1-sync-now-forces-nothing: sync now forces nothing')
