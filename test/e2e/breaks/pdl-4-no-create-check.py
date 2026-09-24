# A CHOSEN LIST IS USED WHETHER OR NOT THE PERSON MAY ADD TO IT: the task is
# refused, where it should have gone to a list they can add to.
# Reddens: planner-default-list: "a chosen list the person may not add to is passed over, not refused: the task lands in the oldest list they can add to"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      if (home?.workspaceId === workspaceId && (await this.canCreateTaskIn(chosen, actorId))) return chosen\n'
b = '      if (home?.workspaceId === workspaceId) return chosen\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdl-4-no-create-check: the create rule is not asked')
