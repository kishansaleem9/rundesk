# REMOVE REMOVES NOTHING.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "removing the sync on the page takes its events off the calendar, and a change to a task there afterwards writes nothing"
#   or "once the member has left the workspace their sync writes nothing more — the task it held comes off their calendar when it changes — and their syncs are kept, not deleted"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 2 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/web/src/components/planner-sync-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                      onClick={() => remove.mutate(r.id)}\n',
     '                      onClick={() => undefined /* BROKEN: remove removes nothing */}\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-w4-remove-removes-nothing: remove removes nothing')
