# Back to the static pair this row existed to correct: drop the third card.
# The two that remain are the two the frame shows first, so a check that reads
# only their copy still passes — which is how the old check stayed green.
# Reddens: teams-empty-state: "there are the frame's three explainer cards"
import io
p = "/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx"
a = "  { id: 'focus', titleKey: 'teams.cardFocusTitle', bodyKey: 'teams.cardFocusBody' },\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-teams-page.tsx: two explainer cards again, as before the frame was read.')
