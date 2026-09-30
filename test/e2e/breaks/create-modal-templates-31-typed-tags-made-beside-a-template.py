# THE MODAL MAKES EACH TAG TYPED BESIDE A TEMPLATE BEFORE THE CREATE
# (`found-30-sep/refused-create-leaves-tags`): so a create from a template, refused, leaves it.
#
# Reddens: create-modal-templates: "and with a template chosen, the refused create adds neither the tag typed beside it nor the template’s own a second time (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      const fields = setInForm()\n',
     "      if (templateId) {\n        for (const name of tagNames) {\n          await api(`/workspaces/${workspaceId}/labels`, { method: 'POST', body: { name, color: colorForTagName(name) } }).catch(() => null)\n        }\n      }\n      const fields = setInForm()\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('create-modal-templates-31-typed-tags-made-beside-a-template: the modal makes typed tags before a create from a template')
