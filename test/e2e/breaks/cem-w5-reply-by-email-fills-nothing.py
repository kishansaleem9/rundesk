# REPLY BY EMAIL FILLS IN NOBODY.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "the answer is drawn as from its sender; Reply by email fills in whom and “Re:”, and the email sent names the answer it answers and joins the same thread"
#
# Answering an email by email starts an empty form: whom and "Re:" are left to be typed again.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const env = answering?.email\n    if (env) {\n',
     '    const env = answering?.email\n    if (env && !env) { // BROKEN: nothing filled in\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-w5-reply-by-email-fills-nothing: REPLY BY EMAIL FILLS IN NOBODY.')
