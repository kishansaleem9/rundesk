# THE EMAIL GOES WITHOUT ITS FILES.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "its words are the box’s, and its file is the one attached, byte for byte"
#
# What was attached in the box is kept on the task and never sent.
import io
p = '/home/user/rundesk/apps/api/src/modules/email/email.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),\n',
     '        ...({}), // BROKEN: no files\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-11-the-file-stays-behind: THE EMAIL GOES WITHOUT ITS FILES.')
