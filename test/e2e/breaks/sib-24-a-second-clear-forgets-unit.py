# A TAB FORGETS WHOM IT NAMED WHEN ITS EMPTY STORE IS CLEARED AGAIN (`found-7-oct/a-tab-that-saw-the-sign-out-misses-the-sign-in`).
#
# A tab that signed itself out may clear its store again (another request
# refused before the sign-in); it still names nobody, and still waits for the
# same person. Remember only the last change and the second clear forgets them.
#
# Reddens: unit: realtime.test.ts "the person remembered is whom the tab named when its store was cleared, kept while it names nobody, and forgotten once it names somebody"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = '  return was ?? held\n'
b = '  return was\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-24-a-second-clear-forgets-unit: a second clear forgets whom the tab named')
