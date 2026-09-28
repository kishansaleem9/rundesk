# `canDropOn` goes back to falling through to the list branch when a folder is in
# flight — which is what it did the moment `folder` joined the drag union. A
# folder dropped on a project row is then accepted, and `dropOn`'s else-branch
# posts it to `/lists/<folderId>/move`: a real route, an id that is not a list.
# Reddens: sidebar-reorder "and a folder dropped on a project sends nothing — there is no route that re-parents one"
#
# REWRITTEN 21 September, AFTER IT RAN GREEN. The first version deleted the LIST
# rule:
#
#     if (dragItem.kind === 'list') return target.kind === 'project'
#
# which is the opposite of the defect it describes. With that line gone there is
# no branch for a folder to fall THROUGH into — folders still reach the explicit
# `return false`, the behaviour is unchanged, and the check stayed green
# correctly. The patch was one of ten in the set and the only one that did not
# redden, which is what sent anyone to look at it.
#
# It also, by accident, proved something worth more than itself: deleting that
# list rule broke list-drops-on-projects and ALL 21 CHECKS STILL PASSED. The
# suite asserted the refusal (a folder is not accepted) and never the permission
# (a list is). Two checks were added for it, and `sidebar-reorder-11` is the
# patch that now covers the line this one used to delete.
#
# The lesson for a patch, as opposed to for a check: a patch has to make the
# code take the WRONG BRANCH, not remove a branch. Removing one changes which
# defects are reachable; that is a different edit with different consequences,
# and here it produced an honest green that read as a worthless check.
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
# The folder's explicit refusal, replaced by the fall-through it exists to
# prevent. Anchored from the newline so the indentation is exact.
a = "\n    return false\n  }\n"
b = "\n    return target.kind === 'project'\n  }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: a folder falls through the list rule and is accepted on a project row.')
