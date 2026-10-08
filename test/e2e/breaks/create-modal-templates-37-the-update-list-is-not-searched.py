# UPDATE EXISTING TEMPLATE IS NOT SEARCHED: the box is drawn and every template stays listed.
# (`found-30-sep/save-as-template-asks-no-description`, batch 19)
# Reddens: create-modal-templates: "Update existing template is searched: part of a template’s name, in any case, narrows the list to it, and a name no template has leaves none and says so"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    const q = prefix === 'update' ? updateQuery.trim().toLowerCase() : ''\n"
b = "    const q = '' // BROKEN: the update list is not searched\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-37-the-update-list-is-not-searched: the update list ignores what is typed')
