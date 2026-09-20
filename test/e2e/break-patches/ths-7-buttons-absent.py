# Neither button is rendered — the status is a bare <select> again, which is
# what the row says Rundesk had.
# Reddens: task-header-status — "the status field carries a one-click advance button"
#          and "and a separate mark-complete button beside it" (plus everything after them)
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '              data-testid="task-status-next"'
b = '              data-testid="task-status-next-DISABLED" hidden'
c = '              data-testid="task-status-complete"'
d = '              data-testid="task-status-complete-DISABLED" hidden'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'next anchor appears {s.count(a)} times, expected exactly 1'
assert s.count(c) == 1, f'complete anchor appears {s.count(c)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b).replace(c, d))
print("task-detail-sheet.tsx: both one-click status controls are hidden and renamed out of reach.")
