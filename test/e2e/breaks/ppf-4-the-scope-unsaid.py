# A FIELD KEPT TO ONE LIST DOES NOT SAY SO on the project's page (`found-6-oct/project-page-offers-field-edits-to-readers`), nor one kept to
# a list the page does not draw.
# Reddens: project-page-controls: "a field kept to one list says so on the project’s page, naming the list — a field of the whole project does not — and the section no longer says every field is on every task"
#   and "and that field says it is only on the tasks of one list, the list it is kept to not being drawn on the page"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
a = "                {f.listId && (\n"
b = "                {false && f.listId && ( // BROKEN: the list is not said\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ppf-4-the-scope-unsaid: a list's field does not name its list")
