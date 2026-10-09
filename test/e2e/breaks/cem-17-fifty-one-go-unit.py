# MORE THAN FIFTY PEOPLE ARE SENT ONE EMAIL.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: unit: comment-email.test.ts "an address that is not one is named in the refusal, and more than fifty people in all are refused"
#
# The limit counts one fewer than it says.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (seen.size > EMAIL_MAX_RECIPIENTS) return',
     '  if (seen.size > EMAIL_MAX_RECIPIENTS + 1) return'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-17-fifty-one-go-unit: MORE THAN FIFTY PEOPLE ARE SENT ONE EMAIL.')
