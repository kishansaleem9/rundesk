# A PERSON'S ACTIVITY IS SEARCHED BY PATTERN AGAIN.
# Reddens: like-literal: "a person’s activity searched for “50%” lists the task with 50% and not the one with 500"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (q) conditions.push(ilike(tasks.title, likeContaining(q)))\n'
b = '    if (q) conditions.push(ilike(tasks.title, `%${q}%`))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lik-4-activity-by-pattern: done')
