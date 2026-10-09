# AN EMAIL GOES WITH NOBODY IN TO.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: unit: comment-email.test.ts "To, CC and BCC go to each address once, in the first box that names it, and an email goes to somebody in To"
#
# Only CC or BCC is filled in, and the email is sent anyway.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (out.to.length === 0) return { ok: false, message: COMMENT_EMAIL_REFUSALS.noRecipient }\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-16-nobody-in-to-unit: AN EMAIL GOES WITH NOBODY IN TO.')
