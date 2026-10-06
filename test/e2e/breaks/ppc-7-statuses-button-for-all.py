# THE PAGE DRAWS STATUSES FOR EVERYBODY AGAIN, whatever it is told.
# Since 6 October it also reddens the check of a page moved to another project before that project has answered, where Statuses
# is drawn on no answer at all (`found-6-oct/project-page-offers-field-edits-to-readers`, the review).
# Reddens: project-page-controls: "a guest passing through is offered none of them: no Statuses, Suggest tasks, Edit or Archive, no Rename or Delete on the list, and the members at most to read"
#   and "moving by the sidebar from a project whose fields and statuses the member may change to one they only view, the page offers nothing on the first project’s answer while the second’s is on its way — no Add field, Statuses or field’s delete — and then has the second’s"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '          {caps?.statuses && (\n            <Button size="sm" variant="outline" onClick={() => setStatusesOpen(true)}>\n'
b = '          {(caps?.statuses || projectId !== \'\') && (\n            <Button size="sm" variant="outline" onClick={() => setStatusesOpen(true)}>\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ppc-7-statuses-button-for-all: Statuses for all')
