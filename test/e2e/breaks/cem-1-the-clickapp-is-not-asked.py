# EMAIL IS SENT WHETHER OR NOT ITS CLICKAPP IS ON.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "Email is off until an owner or admin turns it on: the box is told so, a send is refused in words (403), and nothing is sent or kept"
#   or "Comment ▾ lists Email disabled, saying it is off and who turns it on"
#   or "the mail server takes one email: to the three, the blind copy in no header, from the writer “via Rundesk”, with its own address to answer to and its own Message-ID"
#   or "its words are the box’s, and its file is the one attached, byte for byte"
#   or "it is the task’s email comment: its words, its envelope, its file, and the address its answers come back to — all read by SQL"
#   or "the thread draws it as an email — whom it went to, copied and blind-copied, and its subject — and the box is a comment box again"
#   or "its blind copies are its writer’s to read: a member reading the task is told whom it went to and copied to, not whom it was blind-copied to"
#   or "the answer is drawn as from its sender; Reply by email fills in whom and “Re:”, and the email sent names the answer it answers and joins the same thread"
#   or "refused by the mail server, the box says what it said, keeps everything typed, and nothing is kept as sent"
#   or "what an email said is what went: an edit is refused in words (400), and the thread offers none"
#   or "turned off again, Email is off again"
#
# Re-aimed 9 October: the last 10 of these are knock-ons of the same edit, measured on lane 10 — checks that stand on what the first ones lost.
# Re-aimed 12 October: a refusal now names the task's workspace too (a send from the person's own mailbox asks it).
#
# A workspace that never turned Email on sends it anyway.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (!on) return { task, workspaceId, refusal: { reason: 'off', message: COMMENT_EMAIL_REFUSALS.off, status: 403 } }\n",
     "    if (!on && on) return { task, workspaceId, refusal: { reason: 'off', message: COMMENT_EMAIL_REFUSALS.off, status: 403 } } // BROKEN: the ClickApp is not asked\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-1-the-clickapp-is-not-asked: EMAIL IS SENT WHETHER OR NOT ITS CLICKAPP IS ON.')
