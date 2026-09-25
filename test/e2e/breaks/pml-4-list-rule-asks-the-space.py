# A LIST'S RENAME ASKS THE SPACE ALONE, not a grant on its project.
# Reddens: project-member-levels: "a member given View on a project changes nothing in it — not the admin's task, not a new task, not a list, even one they made — where the space alone would let them, as it does in the project beside it"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      // A grant on the list, its project or its folder decides before the space.\n      within: [\n'
b = '      // A grant on the list, its project or its folder decides before the space.\n      within: listId ? undefined : [\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pml-4-list-rule-asks-the-space: the list rule asks the space')
