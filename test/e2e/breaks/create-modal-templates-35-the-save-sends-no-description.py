# THE MODAL SAVES NO DESCRIPTION: the panel asks for one and the save leaves it out of the body.
# (`found-30-sep/save-as-template-asks-no-description`, batch 19)
# Reddens: create-modal-templates: "and the panel asks for a description beside the name, empty to begin with and optional, and the template keeps the one typed there"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '      const body = { name: templateName.trim(), description: templateDescription.trim() || null, payload: formAsTemplate() }\n'
b = '      const body = { name: templateName.trim(), payload: formAsTemplate() } // BROKEN: the description typed is not sent\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-35-the-save-sends-no-description: the save sends no description')
