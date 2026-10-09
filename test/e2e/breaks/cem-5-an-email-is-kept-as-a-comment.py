# AN EMAIL IS KEPT AS A PLAIN COMMENT.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "it is the task’s email comment: its words, its envelope, its file, and the address its answers come back to — all read by SQL"
#   or "the thread draws it as an email — whom it went to, copied and blind-copied, and its subject — and the box is a comment box again"
#   or "its blind copies are its writer’s to read: a member reading the task is told whom it went to and copied to, not whom it was blind-copied to"
#   or "an answer from somebody it went to lands in the task, under the email, as an email that came in from them (read by SQL)"
#   or "the answer is drawn as from its sender; Reply by email fills in whom and “Re:”, and the email sent names the answer it answers and joins the same thread"
#   or "what an email said is what went: an edit is refused in words (400), and the thread offers none"
#
# Re-aimed 9 October: the last 5 of these are knock-ons of the same edit, measured on lane 10 — checks that stand on what the first ones lost.
#
# Sent, it is kept with no channel and no envelope: the task cannot say it was an email, or to whom.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      .values({ taskId, authorId, body, parentCommentId, mentions: finalMentions.length > 0 ? finalMentions : null, channel: opts.email ? 'email' : 'comment' })\n",
     "      .values({ taskId, authorId, body, parentCommentId, mentions: finalMentions.length > 0 ? finalMentions : null, channel: 'comment' }) // BROKEN: no channel\n"),
    ('    if (opts.email) await this.db.insert(taskCommentEmails).values({ ...opts.email, commentId: comment.id })\n',
     '    if (opts.email) void comment.id // BROKEN: no envelope\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-5-an-email-is-kept-as-a-comment: AN EMAIL IS KEPT AS A PLAIN COMMENT.')
