# A SUBJECT KEEPS ITS LINE BREAKS.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: unit: comment-email.test.ts "a subject is one line, trimmed, and the task’s title when none is given; an answer’s is “Re:” once before the one answered"
#
# A subject typed over two lines goes as two, and a header line ends where it should not.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const line = (s: string) => s.replace(/[\\r\\n\\t]+/g, ' ').replace(",
     "  const line = (s: string) => s.replace(/[\\t]+/g, ' ').replace("),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-18-a-subject-breaks-its-line-unit: A SUBJECT KEEPS ITS LINE BREAKS.')
