# A DATE TYPED BACK WHILE A WRITE IS OUT IS DROPPED (`found-30-sep/sheet-dates-write-as-typed`, as the review found
# it): the box compares what is typed with the date stored, which the write out has not yet replaced, so Enter on
# the 25th and then the 8th it held typed back leaves the 25th.
# Reddens: task-values: "the sheet’s due box stays open while its write is out, and a date corrected meanwhile is written after it: Enter on the 25th, and while that write is held the box is enabled and keeps its focus; the 8th typed back then is kept, and Enter writes it once the 25th has landed — two PATCHes, in that order — so the task holds the 8th (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/lib/date-box.ts'
a = "  if (draft === shown && sending === null) return { kind: 'discard' }\n"
b = "  if (draft === shown) return { kind: 'discard' }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-values-44-a-correction-under-a-write-is-dropped: the stored date typed back is discarded')
