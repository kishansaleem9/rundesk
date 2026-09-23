# THE CREATOR-ONLY PRIVATE RULE, the one filterTasksByContainerAccess carries: a private task assigned to you disappears from your own Home.
# Reddens: home-my-work: "while a private task assigned to the member is on the member’s own list"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          taskVisibilityFilter(this.db, actor.id, isManager),\n'
b = "          isManager ? undefined : or(sql`${tasks.visibility} <> 'private'`, eq(tasks.createdById, actor.id)),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hmw-5-assignees-lose-private: applied")
