# A SPRINT TAKES ANOTHER WORKSPACE'S SPACE: only the space's existence is asked.
# Reddens: sprint-access: "a sprint is not made in a private space the member is refused, under another workspace’s space, in a view-only space, or by a guest — a member makes one in the open space"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.service.ts'
a = "      if (!space || space.workspaceId !== data.workspaceId) throw new NotFoundException('Space not found')\n"
b = "      if (!space) throw new NotFoundException('Space not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("spa-6-made-under-another-workspace: applied")
