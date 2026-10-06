# MAKE DEFAULT PRESSED AT ONCE RUNS SIDE BY SIDE: each clears the default it read, and each sets its own.
# Reddens: view-writes-by-level: "Make default pressed on three views at once leaves the list one default view, four times over"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = '        await lockListViews(tx, existing.listId)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-34-make-default-side-by-side: make default pressed at once runs side by side")
