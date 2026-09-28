# THE PAGE OFFERS THE PENCIL ON YOUR OWN CARD ONLY, as before.
# Reddens: job-title-rule: "the Teams page offers an admin the pencil on a colleague’s card, and the title typed there is saved and shown on the card"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    (!!me && me.id === userId) || (mayProfile && !!role && withinRank(myRole, role))\n'
b = '    (!!me && me.id === userId) || (Boolean(0) && mayProfile && !!role && withinRank(myRole, role))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('jtr-4-pencil-on-your-own-only: done')
