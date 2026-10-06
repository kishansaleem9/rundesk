# A READER'S OWN PRIVATE VIEW IS NOT THEIRS: nobody may change a private view, its maker neither.
# Reddens: unit: view-write.test.ts "a reader’s own private view stays theirs, at any level"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "  if (view.visibility === 'private') return mine ? null : 'private'\n"
b = "  if (view.visibility === 'private') return 'private'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-21-a-readers-private-view-is-not-theirs-unit: a reader's own private view is not theirs: nobody may change a private view, its maker neither")
