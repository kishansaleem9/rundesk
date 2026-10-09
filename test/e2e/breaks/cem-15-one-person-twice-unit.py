# AN ADDRESS IN TWO BOXES GETS TWO COPIES.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: unit: comment-email.test.ts "To, CC and BCC go to each address once, in the first box that names it, and an email goes to somebody in To"
#
# To, CC and BCC are taken as typed, so one person named twice is sent the email twice.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (seen.has(address)) continue\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-15-one-person-twice-unit: AN ADDRESS IN TWO BOXES GETS TWO COPIES.')
