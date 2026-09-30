# `ram-15`'s edit, claimed by the unit test beside the write rule.
# Reddens: unit: task-write.test.ts "tells them a binned task is not there either — not that it is in the bin"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = "  if (!ctx) throw notThere()\n"
b = "  if (!ctx) throw notThere()\n  if (!opts.allowArchived) assertTaskNotInBin(ctx.isArchived)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tw-2-the-bin-is-asked-first-unit: the bin is asked before the read rule')
