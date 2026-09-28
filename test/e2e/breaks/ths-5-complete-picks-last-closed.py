# ✓ takes the LAST closed status rather than the first, so a list with
# Shipped and Binned marks work as Binned.
# Reddens: task-header-status — "and the ✓ will write `shipped` — the FIRST status in the closed category"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "  const completeStatus = orderedStatuses.find((s) => s.category === 'closed') ?? null"
b = "  const completeStatus = [...orderedStatuses].reverse().find((s) => s.category === 'closed') ?? null"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: mark-complete now resolves to the LAST closed status of the list.")
