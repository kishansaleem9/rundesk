# The ▶ wraps from the last status back to the first, so a finished task can be
# sent to the top of the pipeline by pressing "next".
# Reddens: task-header-status — "on the last status the ▶ resolves to nothing and is disabled — it does not wrap round to the start"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """  const nextStatus =
    currentStatusIndex >= 0 && currentStatusIndex < orderedStatuses.length - 1
      ? orderedStatuses[currentStatusIndex + 1]
      : null"""
b = """  const nextStatus =
    currentStatusIndex >= 0
      ? orderedStatuses[(currentStatusIndex + 1) % Math.max(orderedStatuses.length, 1)]
      : null"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the advance button wraps past the last status back to the first.")
