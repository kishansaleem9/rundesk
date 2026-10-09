# THE EMAIL NAMES NO ADDRESS TO ANSWER TO.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "the mail server takes one email: to the three, the blind copy in no header, from the writer “via Rundesk”, with its own address to answer to and its own Message-ID"
#   or "it is the task’s email comment: its words, its envelope, its file, and the address its answers come back to — all read by SQL"
#   or "an answer from somebody it went to lands in the task, under the email, as an email that came in from them (read by SQL)"
#   or "a stranger who writes to the same address is refused, and nothing is written in anybody’s name"
#   or "the answer is drawn as from its sender; Reply by email fills in whom and “Re:”, and the email sent names the answer it answers and joins the same thread"
#
# Re-aimed 9 October: the last 4 of these are knock-ons of the same edit, measured on lane 10 — checks that stand on what the first ones lost.
#
# An answer goes to the server's own sender address, which nothing reads, and never reaches the task.
import io
p = '/home/user/rundesk/apps/api/src/modules/email/email.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        replyTo: opts.replyTo,\n',
     '        replyTo: undefined, // BROKEN: no address to answer to\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-4-answers-come-back-to-nobody: THE EMAIL NAMES NO ADDRESS TO ANSWER TO.')
