# THE KNOWLEDGE FILTER STOPS AT THE SPACE AND THE PROJECT, as its own copy of the rule did: a private list's task is cited.
# Reddens: knowledge-read-access: "a member’s knowledge answer cites no task of a private list they are refused, and cites the open one — the admin’s cites it"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '    const taskOpen = and(taskInReachFilter(this.db, workspaceId, userId, false), taskVisibilityFilter(this.db, userId, false))\n'
b = '    const taskOpen = and(containerVisibilityFilter(this.db, userId, false), taskVisibilityFilter(this.db, userId, false))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("kra-1-knowledge-skips-private-lists: applied")
