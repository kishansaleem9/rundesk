# A WALL-CLOCK TIME IS READ AS UTC.
# (`ledger-rows/row-2294`)
# Reddens: unit: ai-connected.test.ts "is the instant that time names there"
#
# "10:00" is 10:00 UTC wherever the asker is.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-connected.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  let ms = asUtc - offsetAt(asUtc)\n  ms = asUtc - offsetAt(ms)\n  return new Date(ms)\n',
     '  let ms = asUtc - offsetAt(asUtc)\n  ms = asUtc - offsetAt(ms)\n  return new Date(asUtc + 0 * ms)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-u1-the-zone-not-asked: a wall-clock time is read as UTC')
