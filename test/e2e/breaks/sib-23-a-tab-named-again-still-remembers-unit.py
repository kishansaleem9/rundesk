# A TAB REMEMBERS WHOM IT NAMED WHEN CLEARED EVEN AFTER IT NAMES SOMEBODY AGAIN (`found-7-oct/a-tab-that-saw-the-sign-out-misses-the-sign-in`).
#
# The person a cleared tab takes back is forgotten once the tab names somebody
# (a sign-in here, or the take-back itself). Keep them and a tab that signed in
# as somebody else meanwhile still counts as having held them.
#
# Reddens: unit: realtime.test.ts "the person remembered is whom the tab named when its store was cleared, kept while it names nobody, and forgotten once it names somebody"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = '  if (now) return null\n  return was ?? held\n'
b = '  return was ?? held\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-23-a-tab-named-again-still-remembers-unit: the person a cleared tab named is never forgotten')
