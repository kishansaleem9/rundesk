# THE SHEET REFETCHES FOR EVERY EVENT AGAIN, not once a burst: the two copies
# of `task.updated` each refetch everything it has open.
# Reddens: task-sheet-fetches: "in the sheet that made it, the change refetches the task and each open panel at most twice — its own save, and the events that follow it, once"
#   or "in another sheet open on the task, it refetches the task and each open panel once, and that sheet shows the new priority"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '      timer ??= setTimeout(flush, 150)\n'
b = '      flush()\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tsf-1-every-event-refetches: every event refetches')
