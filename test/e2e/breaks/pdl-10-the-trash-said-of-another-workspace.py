# THE SETTINGS SAY A DEFAULT LIST IS IN THE TRASH IN EVERY WORKSPACE: in one whose /task passes that list over, the
# picker calls it a list in the trash.
# Reddens: planner-default-list: "and the picker it sends them to shows the deleted choice as a list in the trash, not “The first list I can add to” — which it still shows in another workspace, where /task passes that list over — and choosing that saves it, so /task lands in the oldest list again"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '    if (home?.workspaceId !== workspaceId) return false\n'
b = '    if (!home) return false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdl-10-the-trash-said-of-another-workspace: the trash is said of another workspace')
