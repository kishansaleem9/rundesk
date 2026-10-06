# A PROTECTED VIEW IS CHANGED BY ANYBODY AT EDIT, its maker and the managers no different.
# Reddens: unit: view-write.test.ts "at Edit a shared view may be changed; a protected one only by its maker or a manager"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "  if (view.visibility === 'protected' && !mine && !facts.manager) return 'protected'\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('vwl-23-protect-protects-nothing-unit: a protected view is changed by anybody at edit, its maker and the managers no different')
