# A MEMBER IS NOT ASKED WHICH SPACES THEY MAY ADD TO: a view-only space's menus
# offer them a task, a list, a folder and a form again.
# Reddens: view-only-space-menus: "a view-only space’s own menu offers a member nothing that goes in it (a task, a form, a list, a folder, a project) — the open space’s offers them, and the view-only space’s offers them to the admin"
#   or "the Task, List, Folder and Form creators offer the member the open space and not the view-only one"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-creatable.ts'
s = io.open(p, encoding='utf-8').read()
a = '      if (type.scopedToSpace && answered) return mayAddHere\n'
b = "      if (type.scopedToSpace && answered && workspaceId === '') return mayAddHere\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("vsm-1-members-not-asked: members not asked")
