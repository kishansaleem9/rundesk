# EMAIL IS MISSING FROM THE CLICKAPPS.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "Settings → ClickApps lists Email, off; switched on, it is kept for the workspace (read by SQL) and Comment ▾ offers Email"
#   or "the box becomes an email: From the writer “via Rundesk”, To, a subject that is the task’s title until one is typed, and Send"
#   or "typing in To suggests the task’s Email field and the workspace’s members, and a suggestion chosen is an address in To"
#   or "the mail server takes one email: to the three, the blind copy in no header, from the writer “via Rundesk”, with its own address to answer to and its own Message-ID"
#   or "its words are the box’s, and its file is the one attached, byte for byte"
#   or "it is the task’s email comment: its words, its envelope, its file, and the address its answers come back to — all read by SQL"
#   or "the thread draws it as an email — whom it went to, copied and blind-copied, and its subject — and the box is a comment box again"
#   or "its blind copies are its writer’s to read: a member reading the task is told whom it went to and copied to, not whom it was blind-copied to"
#   or "an answer from somebody it went to lands in the task, under the email, as an email that came in from them (read by SQL)"
#   or "a stranger who writes to the same address is refused, and nothing is written in anybody’s name"
#   or "the answer is drawn as from its sender; Reply by email fills in whom and “Re:”, and the email sent names the answer it answers and joins the same thread"
#   or "refused by the mail server, the box says what it said, keeps everything typed, and nothing is kept as sent"
#   or "an address that is not one is named in the refusal, and an email with nobody in To is refused (400)"
#   or "what an email said is what went: an edit is refused in words (400), and the thread offers none"
#
# Re-aimed 9 October: the last 13 of these are knock-ons of the same edit, measured on lane 10 — checks that stand on what the first ones lost.
#
# Nobody can turn it on from Settings, so the comment box never sends email.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  { flag: FLAGS.TASK_EMAIL, nameKey: 'settings.featTaskEmail', descKey: 'settings.featDescTaskEmail' },\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-w6-the-clickapp-is-not-listed: EMAIL IS MISSING FROM THE CLICKAPPS.')
