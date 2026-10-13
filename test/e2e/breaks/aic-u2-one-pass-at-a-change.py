# A TIME BESIDE A DAYLIGHT-SAVING CHANGE TAKES THE OTHER SIDE'S OFFSET.
# (`ledger-rows/row-2294`)
# Reddens: unit: ai-connected.test.ts "takes the offset of its own side of a daylight-saving change"
#
# One pass: the offset is read at the wrong instant, an hour out on the morning the clocks go back.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-connected.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  let ms = asUtc - offsetAt(asUtc)\n  ms = asUtc - offsetAt(ms)\n',
     '  let ms = asUtc - offsetAt(asUtc)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-u2-one-pass-at-a-change: the offset is read once')
