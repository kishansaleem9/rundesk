# THE ANSWER THE PAGE KEEPS WHILE THE NEXT ONE LOADS IS WHATEVER IT LAST HAD, as the first fix kept it (`found-6-oct/project-page-offers-field-edits-to-readers`,
# the review): moved by a link to a project the member only views, the page offers the first project's Add field, Statuses and field deletes.
# Reddens: project-page-controls: "moving by the sidebar from a project whose fields and statuses the member may change to one they only view, the page offers nothing on the first project’s answer while the second’s is on its way — no Add field, Statuses or field’s delete — and then has the second’s"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
a = "    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === projectId ? previous : undefined),\n"
b = "    placeholderData: (previous) => previous, // BROKEN: the last answer stands for whatever project the page moves to\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ppf-9-the-last-answer-stands-for-any-project: another project's answer stands while this one's loads")
