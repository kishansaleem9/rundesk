# A SEND TIME IN THE PAST IS TAKEN.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: unit: mail-message.test.ts "a send time is a moment from a minute to a year ahead"
#
# Only the year ahead is asked.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (!Number.isFinite(at) || at - now < SCHEDULE_MIN_MS || at - now > SCHEDULE_MAX_MS) return null',
     '  if (!Number.isFinite(at) || at - now > SCHEDULE_MAX_MS) return null'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-u2-past-send-times: A SEND TIME IN THE PAST IS TAKEN.')
