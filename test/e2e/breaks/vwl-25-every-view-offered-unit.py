# EVERY VIEW IS OFFERED TO BE CHANGED, whatever the rule says.
# Reddens: unit: view-write.test.ts "offers a reader nothing on a shared view"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = '  const mayChange = viewWriteBar(view, actor, facts) === null\n'
b = '  const mayChange = true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('vwl-25-every-view-offered-unit: every view is offered to be changed, whatever the rule says')
