# A GUEST MAKES AND CHANGES SPRINTS: the reach's "none" is not a refusal.
# Reddens: sprint-access: "a sprint is not made in a private space the member is refused, under another workspace’s space, in a view-only space, or by a guest — a member makes one in the open space"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.service.ts'
a = "    if ((await goalReach(this.db, at.workspaceId, actor)) === 'none') {\n      throw new ForbiddenException('Guests cannot make or change sprints')\n    }\n"
b = '    void goalReach\n    void ForbiddenException\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("spa-7-guests-make-and-change: applied")
