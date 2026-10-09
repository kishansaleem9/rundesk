# AN ANSWER TO AN ANSWER SAYS "RE: RE:".
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: unit: comment-email.test.ts "a subject is one line, trimmed, and the task’s title when none is given; an answer’s is “Re:” once before the one answered"
#
# Every answer adds another "Re:" before the subject.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  return /^re:/i.test(s) ? s : `Re: ${s}`.slice(0, EMAIL_SUBJECT_MAX)\n',
     '  return `Re: ${s}`.slice(0, EMAIL_SUBJECT_MAX)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-19-re-twice-unit: AN ANSWER TO AN ANSWER SAYS "RE: RE:".')
