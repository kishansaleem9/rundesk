# The pager increments its counter and the card never changes — so "1/4" becomes
# "2/4" over the same text. The facade frame `12:45` exists to rule out: a
# carousel verified from one frame could be three static cards.
# Reddens: planner-onboarding: "pressing → moves it to \"Automate your meeting notes\", which is what changes between `12:40` and `12:45`"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '  const key = CARDS[card]\n'
b = '  const key = CARDS[0]\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the carousel counter moves and the card does not.')
