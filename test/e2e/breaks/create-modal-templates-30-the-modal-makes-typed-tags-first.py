# THE MODAL MAKES EACH TYPED TAG BEFORE A PLAIN CREATE (`found-30-sep/refused-create-leaves-tags`):
# `POST /workspaces/:ws/labels` first, as before, so a create then refused leaves the tag.
#
# Reddens: create-modal-templates: "in the modal, a create refused after a tag was typed (its task type gone, 400) says why, makes no task, and adds the typed tag nowhere (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      const fields = setInForm()\n',
     "      if (!templateId) {\n        for (const name of tagNames) {\n          await api(`/workspaces/${workspaceId}/labels`, { method: 'POST', body: { name, color: colorForTagName(name) } }).catch(() => null)\n        }\n      }\n      const fields = setInForm()\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('create-modal-templates-30-the-modal-makes-typed-tags-first: the modal makes typed tags before a plain create')
