# THE PLANNER’S SETTINGS NEVER SAY THE CHOSEN DEFAULT LIST IS IN THE TRASH: the picker draws it as "The first list
# I can add to", as it did.
# Reddens: planner-default-list: "and the picker it sends them to shows the deleted choice as a list in the trash, not “The first list I can add to” — which it still shows in another workspace, where /task passes that list over — and choosing that saves it, so /task lands in the oldest list again"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '      if (err instanceof ListInTrashException) return true\n'
b = '      if (err instanceof ListInTrashException) return false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdl-9-the-settings-never-say-the-trash: the settings never say the trash')
