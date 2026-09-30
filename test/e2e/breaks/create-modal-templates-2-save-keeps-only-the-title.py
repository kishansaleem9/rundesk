# SAVE AS TEMPLATE KEEPS THE TITLE AND DROPS THE REST OF THE FORM.
#
# The template is made, under the name asked for, and holds nothing of what was
# typed but the title: its priority, description, estimate, dates and tags are
# the empty template's. It looks saved and restores almost nothing.
#
# Reddens: create-modal-templates: "Save as template makes a template holding the form’s fields: title, description, priority, the estimate in seconds, start and due as days from today, and the tags"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "        ? api<TaskTemplate>(`/workspaces/${workspaceId}/task-templates`, { method: 'POST', body })\n"
b = "        ? api<TaskTemplate>(`/workspaces/${workspaceId}/task-templates`, { method: 'POST', body: { name: body.name, payload: { title: body.payload.title } } })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-2-save-keeps-only-the-title: the new template holds the title alone')
