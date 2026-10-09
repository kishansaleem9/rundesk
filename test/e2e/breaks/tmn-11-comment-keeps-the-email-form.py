# CHOOSING COMMENT AGAIN LEAVES THE BOX AN EMAIL.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: task-mentions: "and choosing Comment turns it back: no email fields, and Comment posts"
#
# The tick moves back to Comment and the email fields stay, with Send in place of Comment.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("                  onSelect={() => {\n                    setMode('comment')\n",
     "                  onSelect={() => {\n                    void 'comment' // BROKEN: the mode stays\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tmn-11-comment-keeps-the-email-form: CHOOSING COMMENT AGAIN LEAVES THE BOX AN EMAIL.')
