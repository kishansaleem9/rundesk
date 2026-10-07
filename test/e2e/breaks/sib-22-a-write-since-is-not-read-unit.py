# A TAB THAT SIGNED ITSELF OUT READS BACK WHATEVER IS STORED NOW (`found-7-oct/a-tab-that-saw-the-sign-out-misses-the-sign-in`).
#
# What the tab reads back is the storage at the moment it hears the write, and
# another write may have come since. Drop the look at what is stored now and a
# sign-in by somebody else just after the person's own is read into the tab,
# which then names somebody it never held.
#
# Reddens: unit: realtime.test.ts "somebody else’s sign-in is not taken, nor one the storage has moved on from, nor a write that is no sign-in, nor anything by a tab that names somebody or held nobody"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = ' && signedInElsewhere(null, storedNow(), held)\n'
b = '\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-22-a-write-since-is-not-read-unit: what is stored now is not looked at')
