# A REFUSED NEW FIELD SAYS NOTHING, as it did (`found-6-oct/project-page-offers-field-edits-to-readers`).
# Reddens: project-page-controls: "a field’s create and delete refused since the page was drawn are each said in the server’s words, and nothing changes (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
a = "    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('projectShell.fieldNotCreated')),\n"
b = "    // BROKEN: a refused new field says nothing\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ppf-7-a-refused-create-unsaid: a refused create is said nowhere")
