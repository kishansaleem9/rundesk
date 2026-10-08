# AN UPDATE STARTS FROM NO DESCRIPTION, so pressing it clears the template’s own.
# (`found-30-sep/save-as-template-asks-no-description`, batch 19)
# Reddens: create-modal-templates: "and its panel starts from the template’s own description, which the update keeps"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    setTemplateDescription(panel.kind === 'update' ? panel.template.description ?? '' : '')\n"
b = "    setTemplateDescription('') // BROKEN: an update starts from no description\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-36-the-update-starts-from-no-description: an update starts from an empty description')
