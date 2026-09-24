# A STANDUP'S "HELD UP BY" SKIPS THE LIST'S RULE: a private list's blocked task is named to a colleague.
# Reddens: private-list-reach: "the admin’s standup, asked for by the member, names none of the private list’s tasks — nor what holds them up — and the admin’s own does"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '          containerVisibilityFilter(this.db, requesterId, isManager),\n          listVisibilityFilter(requesterId, isManager),\n'
b = '          containerVisibilityFilter(this.db, requesterId, isManager),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-15-held-up-by-skips-the-list: applied")
