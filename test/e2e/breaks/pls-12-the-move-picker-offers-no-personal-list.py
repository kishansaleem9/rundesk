# THE MOVE PICKER OFFERS NO PERSONAL LIST.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "the Move picker offers her her own Personal List — and Max not hers — and the shared task moved into it takes its sharing: Max read it before, and is refused it after"
#
# A task is moved only within the hierarchy; ClickUp moves one into a Personal List.
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    return this.withPersonalList(tree, workspaceId, actorId)\n',
     '    return tree // BROKEN: no Personal List offered\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-12-the-move-picker-offers-no-personal-list: THE MOVE PICKER OFFERS NO PERSONAL LIST.')
