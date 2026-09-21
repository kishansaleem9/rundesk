# Drag for projects only, so a list cannot be moved between projects — the
# half-build that passes every project check.
# Reddens: sidebar-sections: "and a list can be dragged into another project"
#
# RE-ANCHORED. The original matched `return target.kind === 'project'` as the
# LAST line of canDropOn. It stopped matching the day the `folder` branch was
# added below it and the function started ending in `return false` — so the
# patch reported PATCH FAILED against a function it was still perfectly able
# to break. A break patch that cannot find its line is a check with no baseline.
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = "    if (dragItem.kind === 'list') return target.kind === 'project'"
b = "    if (dragItem.kind === 'list') return false"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: lists are no longer accepted by any target — the tree has drag for projects only.')
