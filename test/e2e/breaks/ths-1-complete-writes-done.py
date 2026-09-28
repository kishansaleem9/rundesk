# THE PATCH THIS ROW EXISTS FOR — the ✓ always writes the default pipeline's
# `done`, whatever this list's statuses actually are. It demos perfectly on a
# fresh list and is wrong on every renamed one: the facade.
# Reddens: task-header-status — "and the ✓ will write `shipped` — the FIRST status in the closed category" and
#          "a list with no closed status disables the ✓ rather than inventing `done`"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "  const completeStatus = orderedStatuses.find((s) => s.category === 'closed') ?? null"
b = "  const completeStatus = { key: 'done', name: 'Done', category: 'closed' }"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the mark-complete button now writes the hard-coded key `done` for every list.")
