# THE BLIND COPIES ARE NOT SENT.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "the mail server takes one email: to the three, the blind copy in no header, from the writer “via Rundesk”, with its own address to answer to and its own Message-ID"
#   or "refused by the mail server, the box says what it said, keeps everything typed, and nothing is kept as sent"
#
# Re-aimed 9 October: the last 1 of these are knock-ons of the same edit, measured on lane 10 — checks that stand on what the first ones lost.
#
# The email goes to To and CC; the people blind-copied never get it.
import io
p = '/home/user/rundesk/apps/api/src/modules/email/email.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        ...(opts.bcc.length ? { bcc: opts.bcc } : {}),\n',
     '        ...({}), // BROKEN: no blind copies\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-3-the-blind-copy-goes-nowhere: THE BLIND COPIES ARE NOT SENT.')
