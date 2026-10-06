# A DATE TYPED BACK WHILE A WRITE IS OUT IS DISCARDED (`found-30-sep/sheet-dates-write-as-typed`, as the review found
# it), asked of `dateBoxCommit` itself: the stored date, which the write out is about to replace, reads as no change.
# Reddens: unit: date-box.test.ts "writes the stored date typed back while another is on its way, which is about to replace it"
import io
p = '/home/user/rundesk/apps/web/src/lib/date-box.ts'
a = "  if (draft === shown && sending === null) return { kind: 'discard' }\n"
b = "  if (draft === shown) return { kind: 'discard' }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sdt-4-a-correction-under-a-write-is-discarded-unit: the stored date typed back is discarded')
