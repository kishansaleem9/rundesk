# THE SECTION SAYS EVERY FIELD IS ON EVERY TASK OF THE PROJECT, as it did (`found-6-oct/project-page-offers-field-edits-to-readers`).
# Reddens: project-page-controls: "a field kept to one list says so on the project’s page, naming the list — a field of the whole project does not — and the section no longer says every field is on every task"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = "  'projectShell.customFieldsDesc': 'Fields defined here appear on every task in this project, except a field kept to one list, which appears only on that list’s tasks.',\n"
b = "  'projectShell.customFieldsDesc': 'Fields defined here appear on every task in this project.', // BROKEN: as it read\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ppf-5-the-section-says-every-task: the section says every field is on every task")
