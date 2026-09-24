# A SPRINT OPENS BY ID FOR ANYBODY IN ITS WORKSPACE: the list hides it, the id still opens it.
# Reddens: sprint-access: "a private space’s sprint is not found for a member refused the space, nor its tasks — the open one opens, and the admin opens it"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.service.ts'
a = "    if (actor && !(await readableSprint(this.db, sprintId, actor))) throw new NotFoundException('Sprint not found')\n"
b = '    void readableSprint\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("spa-3-opened-by-id: applied")
