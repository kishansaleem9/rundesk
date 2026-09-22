# The invite button closes over nothing: it renders, it is pressed, and no
# invitation is created.
#
# The facade in the one place it is least visible. The picker offers the
# invitation, the button carries the address in its own label, pressing it
# leaves no error — and the person waits for a colleague who was never asked.
# There is no second surface to notice: an invitation that does not exist shows
# up nowhere, which is why the check reads
# `GET /invitations/workspace/:id` rather than looking at the screen.
#
# `invite.mutate(query.trim())` becomes a no-op rather than being removed, so
# the button keeps its disabled-while-pending state and its label. Everything
# an accessibility tree reports about it is unchanged.
#
# ONE CHECK. "typing an address nobody here has offers to invite them" passes —
# the offer is exactly what still works — and the check under it fails. That
# pair is the suite's own version of the rule this audit keeps arriving at: the
# offer and the outcome are two claims, and a suite that checks only the first
# passes against a button wired to nothing.
#
# Reddens: assignee-picker: "and the invitation is really created"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "          onClick={() => invite.mutate(query.trim())}"
b = "          onClick={() => {}}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the invite button no longer creates an invitation.')
