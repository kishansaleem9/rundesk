# AN EMAIL THE MAIL SERVER REFUSED IS KEPT AS SENT.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "refused by the mail server, the box says what it said, keeps everything typed, and nothing is kept as sent"
#
# The refusal is swallowed: the box says nothing and the task keeps an email that never went.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (err instanceof TaskEmailRefused) throw new BadGatewayException(`The mail server did not take it: ${err.said}`)\n      throw err\n',
     '      if (!(err instanceof TaskEmailRefused)) throw err // BROKEN: a refusal is kept as sent\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-9-a-refusal-is-kept-as-sent: AN EMAIL THE MAIL SERVER REFUSED IS KEPT AS SENT.')
