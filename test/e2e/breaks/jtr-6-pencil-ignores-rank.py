# THE PAGE OFFERS A MANAGER THE PENCIL ON AN ADMIN'S CARD: the rank is not asked.
# Reddens: job-title-rule: "the Teams page offers a manager the pencil on a member’s card and not on an admin’s, as the API answers"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    (!!me && me.id === userId) || (mayProfile && !!role && withinRank(myRole, role))\n'
b = '    (!!me && me.id === userId) || (mayProfile && !!role)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('jtr-6-pencil-ignores-rank: done')
