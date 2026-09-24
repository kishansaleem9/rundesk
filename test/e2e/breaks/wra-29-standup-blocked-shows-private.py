# WHAT HOLDS A PERSON UP, WITH NO PRIVATE-ITEM RULE: the query aliases the task, so the rule is written out, and this drops it.
# Reddens: workspace-read-access: "a colleague’s standup, what they did and what holds them up, tells a member nothing of a space they are refused nor of a private task — the admin’s own tells it"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = "          isManager\n            ? undefined\n            : or(\n                ne(blocked.visibility, 'private'),\n                eq(blocked.createdById, requesterId),\n                sql`exists (select 1 from task_assignees ta where ta.task_id = ${blocked.id} and ta.user_id = ${requesterId})`,\n              ),\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-29-standup-blocked-shows-private: applied")
