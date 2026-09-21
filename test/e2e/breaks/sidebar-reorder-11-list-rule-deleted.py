# The list rule removed from `canDropOn`, so a list dropped on a project row is
# refused and the tree loses the only gesture that moves a list between
# projects.
#
# This is the edit `sidebar-reorder-6` used to make by mistake, kept on purpose.
# It ran against all 21 checks and every one of them passed: the suite asserted
# that a FOLDER on a project row sends nothing, and never that a LIST on one
# sends something. A refusal asserted without its permission is half a rule, and
# the half with no check is the half that can be deleted.
#
# Reddens: sidebar-reorder:
#   "a list dropped ON a project row is accepted"
#   "and it lands in that project"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "\n    if (dragItem.kind === 'list') return target.kind === 'project'\n"
b = "\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: lists can no longer be dropped onto a project row.')
