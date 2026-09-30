# THE BIN IS ASKED BEFORE ANYTHING ELSE, AS IT WAS: a binned task answers 409 "This task is in the bin" to a
# stranger, a guest and a member it refuses, where an id naming nothing answers 404.
# Reddens: refused-as-missing: "a task in the bin is in the bin only to somebody who may open it — the member’s own says so (409) — and to the member refused a binned private task, a guest and a user of another organisation it is not there, as an id naming nothing"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = "  if (!ctx) throw notThere()\n"
b = "  if (!ctx) throw notThere()\n  if (!opts.allowArchived) assertTaskNotInBin(ctx.isArchived)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-15-the-bin-is-asked-first: the bin is asked before the read rule')
