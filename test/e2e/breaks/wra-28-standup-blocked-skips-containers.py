# WHAT HOLDS A PERSON UP, WITH NO CONTAINER RULE, as it was: a blocked task of a refused space, by title.
# Reddens: workspace-read-access: "a colleague’s standup, what they did and what holds them up, tells a member nothing of a space they are refused nor of a private task — the admin’s own tells it"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = '          containerVisibilityFilter(this.db, requesterId, isManager),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-28-standup-blocked-skips-containers: applied")
