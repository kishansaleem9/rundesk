# The ▶ advances to a fixed key instead of to this list's next status.
# Reddens: task-header-status — "the advance button will write `cooking` — the list's own second status",
#          "the task is `cooking` when read back from the API", "and its category moved with it, so reports and Workload agree with the pill",
#          "from `cooking` the same button now offers `shipped` — it reads the current status, not a constant",
#          "and pressing it again really writes `shipped`"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """  const nextStatus =
    currentStatusIndex >= 0 && currentStatusIndex < orderedStatuses.length - 1
      ? orderedStatuses[currentStatusIndex + 1]
      : null"""
b = "  const nextStatus = { key: 'in_progress', name: 'In progress', category: 'in_progress' }"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the advance button now always offers `in_progress`, whatever the list holds.")
