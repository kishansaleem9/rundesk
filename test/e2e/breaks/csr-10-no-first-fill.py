# A NEW SYNC WRITES NONE OF THE TASKS ALREADY THERE.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "the tasks already in the folder are written to that calendar once the sync is made: a task due at a time is the hour before it, under its name — and an undated one is not"
#   or "renaming a task and moving its due time changes its event — the same event, not a second — and a change the event does not show writes nothing"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    void this.fill(rule.scopeType, rule.scopeId).catch(() => undefined)\n',
     '    void this.fill.name // BROKEN: no first fill\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-10-no-first-fill: no first fill')
