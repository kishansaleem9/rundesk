# THE CREATE MODAL SAYS NOTHING OF A TEMPLATE'S VALUES LEFT OUT AGAIN, though
# the answer names them (`found-30-sep/template-leaves-values-out-silently`).
# Reddens: create-modal-templates: "and the modal says so: Create instantly from that template, in that list, makes the task and names the Estimate, the Severity and the Contact as not applied, and not the Note"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    const leftOut = made.valuesLeftOut ?? []\n    if (leftOut.length) {\n"
b = "    const leftOut = made.valuesLeftOut ?? []\n    if (leftOut.length < 0) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-33-the-modal-keeps-quiet: the modal never warns')
