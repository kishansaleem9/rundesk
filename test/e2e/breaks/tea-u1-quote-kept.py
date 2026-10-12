# AN ANSWER KEEPS THE QUOTE OF WHAT IT ANSWERS.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: unit: mail-message.test.ts "an answer lands without the quote of what it answers"
#
# The words are kept to their end.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/mail-message.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const kept = cutAt > 0 ? lines.slice(0, cutAt) : lines',
     '  const kept = lines'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-u1-quote-kept: AN ANSWER KEEPS THE QUOTE OF WHAT IT ANSWERS.')
