# A MODE WITH NO SEND BEHIND IT. Email becomes selectable, so the composer
# can be put into a state it cannot post from -- the dead control, which is
# worse than the absence this row started as.
# Reddens: task-mentions: "Comment carries the tick and Email is not selectable"
#   or "and pressing Email leaves the composer in Comment mode rather than a mode with no send behind it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                  data-testid="comment-mode-item-email"
                  data-available="no"
                  disabled"""
b = """                  data-testid="comment-mode-item-email"
                  data-available="yes\""""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the Email composer mode is selectable again.")
