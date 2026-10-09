# THE BOX DOES NOT SAY THE MAIL SERVER REFUSED IT.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "refused by the mail server, the box says what it said, keeps everything typed, and nothing is kept as sent"
#
# A refused email leaves the form as it was with nothing beside it to say why.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        {mode === 'email' && emailError && (\n",
     "        {mode === 'never' && emailError && (\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-w4-a-refusal-is-not-said: THE BOX DOES NOT SAY THE MAIL SERVER REFUSED IT.')
