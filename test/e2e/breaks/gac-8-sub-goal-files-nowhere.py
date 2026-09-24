# A SUB-GOAL IS FILED IN NO SPACE, whatever its parent's: under a private space's goal, it is the whole workspace's.
# Reddens: goal-access: "a sub-goal made under the private goal, naming no space, is filed in the private space — the admin lists it, the member does not"
import io
p = '/home/user/rundesk/apps/api/src/modules/goals/goals.service.ts'
a = '      if (data.spaceId === undefined) spaceId = parent.spaceId\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-8-sub-goal-files-nowhere: applied")
