# "Next" is taken from the start of the pipeline rather than from where the task
# actually is. The FIRST press is right, so a suite that only presses once
# cannot tell; the second press is where it shows.
# Reddens: task-header-status — "from `cooking` the same button now offers `shipped`"
#          and "pressing it again really writes `shipped`"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """      ? orderedStatuses[currentStatusIndex + 1]
      : null"""
b = """      ? orderedStatuses[1]
      : null"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the advance button reads the second status of the list, not the one after the current.")
