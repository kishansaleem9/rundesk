# SAVE AS TEMPLATE AND UPDATE EXISTING TEMPLATE ARE OFFERED TO ANYBODY.
#
# Offered once the permission set has loaded, whatever it says, so a member is
# offered two writes the API answers 403 for: the product's rule is never to
# offer what the server refuses.
#
# Reddens: create-modal-templates: "a member without template.manage is offered Use Template and Create instantly from template, and not Save or Update, which the server refuses them (403)"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "  const mayManageTemplates = usePermissions(workspaceId).can('template.manage') === true\n"
b = "  const mayManageTemplates = usePermissions(workspaceId).can('template.manage') !== null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-4-save-offered-to-anybody: Save and Update offered without template.manage')
