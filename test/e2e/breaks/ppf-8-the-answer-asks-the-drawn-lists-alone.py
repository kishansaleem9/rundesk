# THE PROJECT'S ANSWER IS ASKED FOR THE LISTS THE PAGE DRAWS ALONE (`found-6-oct/project-page-offers-field-edits-to-readers`): a field kept to an
# archived list has no answer, and its delete is offered to nobody, the admin included.
# Reddens: project-page-controls: "and a field kept to a list the page does not show — an archived one — is offered its delete by that list’s own answer: the admin is offered it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
a = "  const listIds = [...new Set([...lists.map((l) => l.id), ...projectFields.flatMap((f) => (f.listId ? [f.listId] : []))])].sort().join(',')\n"
b = "  const listIds = lists.map((l) => l.id).sort().join(',') // BROKEN: the fields' lists are not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ppf-8-the-answer-asks-the-drawn-lists-alone: a field of an archived list has no answer")
