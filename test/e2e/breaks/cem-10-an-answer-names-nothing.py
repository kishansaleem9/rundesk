# AN ANSWER BY EMAIL NAMES NO MESSAGE IT ANSWERS.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "the answer is drawn as from its sender; Reply by email fills in whom and “Re:”, and the email sent names the answer it answers and joins the same thread"
#
# The other side's mail client cannot thread it under what it answers.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      await this.email.sendTaskEmail({ fromName, to, cc, bcc, subject, text: body, replyTo, messageId, inReplyTo, attachments })\n',
     '      await this.email.sendTaskEmail({ fromName, to, cc, bcc, subject, text: body, replyTo, messageId, inReplyTo: void inReplyTo, attachments }) // BROKEN: answers nothing\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-10-an-answer-names-nothing: AN ANSWER BY EMAIL NAMES NO MESSAGE IT ANSWERS.')
