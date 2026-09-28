# THE PAGE OFFERS EVERYONE THE PENCIL ON EVERY CARD.
# Reddens: job-title-rule: "the Teams page offers a plain member the pencil on their own card and not on a colleague’s"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    (!!me && me.id === userId) || (mayProfile && !!role && withinRank(myRole, role))\n'
b = '    (!!me && me.id === userId) || Boolean(1) || (mayProfile && !!role && withinRank(myRole, role))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('jtr-5-pencil-for-everyone: done')
