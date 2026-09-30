# UPDATE EXISTING TEMPLATE SENDS THE PARTS THE FORM CANNOT SAY, EMPTY.
#
# The service merges the payload it is sent over the one it holds, key by key,
# so a key left out is kept and a key sent empty is wiped. This sends
# checklists, subtasks and custom-field values as empty lists, and a template's
# whole checklist goes because somebody corrected its title from the modal.
#
# Reddens: create-modal-templates: "and it keeps the template’s checklists, subtasks and custom-field value, which the form cannot say"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "        : api<TaskTemplate>(`/workspaces/${workspaceId}/task-templates/${panel.template.id}`, { method: 'PATCH', body })\n"
b = "        : api<TaskTemplate>(`/workspaces/${workspaceId}/task-templates/${panel.template.id}`, { method: 'PATCH', body: { ...body, payload: { ...body.payload, checklists: [], subtasks: [], customFieldValues: [] } } })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-3-update-overwrites-checklists: the update wipes checklists, subtasks and custom fields')
