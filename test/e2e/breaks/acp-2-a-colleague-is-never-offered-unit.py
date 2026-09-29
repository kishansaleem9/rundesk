# ASSIGNING A TEAMMATE OFFERS NOTHING AGAIN, asked of `offersPriority` itself (`ledger-rows/row-850`).
# Measured 29 September: "a task they have ticked off may be offered again" goes with it, its assignee being a colleague too.
# Reddens: unit: use-priorities.test.ts "assigning a colleague offers to add the task to their priorities"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-priorities.ts'
a = "  if (opts.assigneeId !== opts.currentUserId && opts.viewerRole === 'guest') return false\n"
b = "  if (opts.assigneeId !== opts.currentUserId) return false\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-2-a-colleague-is-never-offered-unit: assigning somebody else offers nothing')
