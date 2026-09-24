# THE RULE WRITTEN AS `or(isNull(taskId), viewer)`: for a manager the viewer is undefined, drizzle drops it,
# and the list reads "typed lines only" — the admin's own pinned tasks vanish. The first draft of the fix did this.
# Reddens: workspace-read-access: "a colleague’s priorities show a member the typed ones and the tasks they may open, and no title from a space they are refused — the admin’s own show it"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = '          viewer ? or(isNull(userPriorities.taskId), viewer) : undefined,\n'
b = '          or(isNull(userPriorities.taskId), viewer),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-31-priorities-hide-pinned-tasks: applied")
