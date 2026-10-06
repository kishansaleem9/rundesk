# A FIELD OF A LIST THE PAGE DOES NOT DRAW HAS NO WORDS FOR ITS SCOPE (`found-6-oct/project-page-offers-field-edits-to-readers`, the review):
# the line reads "Only on tasks in " with no list after it.
# Reddens: project-page-controls: "and that field says it is only on the tasks of one list, the list it is kept to not being drawn on the page"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
a = ("                    {listName(f.listId)\n"
     "                      ? t('projectShell.fieldOnList', { list: listName(f.listId)! })\n"
     "                      : t('projectShell.fieldOnOneList')}\n")
b = "                    {t('projectShell.fieldOnList', { list: listName(f.listId) ?? '' }) /* BROKEN: no words for a list the page does not draw */}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ppf-10-a-hidden-list-unnamed: a field of a list the page does not draw names no list")
