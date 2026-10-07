# A TAB THAT SIGNED ITSELF OUT TAKES NOBODY BACK, READ FROM THE TAB (`found-7-oct/a-tab-that-saw-the-sign-out-misses-the-sign-in`).
#
# The rule that says a write is the sign-in of the person a cleared tab named
# answers no to every write: the tab names nobody after the next sign-in too.
#
# Reddens: unit: realtime.test.ts "a tab that signed itself out takes back the person it named when they sign in again in another tab, while the storage still names them"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = '  return signedInElsewhere(change.oldValue, change.newValue, held) && signedInElsewhere(null, storedNow(), held)\n'
b = '  return false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-21-a-signed-out-tab-takes-nobody-back-unit: no write is taken for the person a cleared tab named')
