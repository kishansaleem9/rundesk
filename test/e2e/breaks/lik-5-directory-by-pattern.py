# THE USER DIRECTORY IS SEARCHED BY PATTERN AGAIN.
# Reddens: like-literal: "the platform user directory searched for “50%” finds the person with 50% in their name and not the one with 500"
import io
p = '/home/user/rundesk/apps/api/src/modules/organizations/organizations.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      ? or(ilike(users.displayName, likeContaining(q)), ilike(users.email, likeContaining(q)))\n'
b = '      ? or(ilike(users.displayName, `%${q}%`), ilike(users.email, `%${q}%`))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lik-5-directory-by-pattern: done')
