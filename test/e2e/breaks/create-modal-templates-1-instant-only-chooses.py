# CREATE INSTANTLY FROM TEMPLATE ONLY CHOOSES THE TEMPLATE, as Use Template does.
#
# The two items differ in exactly this: one makes the task the moment it is
# chosen, the other waits for Create task. Here "instantly" chooses and makes
# nothing, so the frame's second item is the first one under another name.
#
# Reddens: create-modal-templates: "Create instantly from template makes the task the moment one is chosen, with no submit: in the chosen list, under the typed title, with the template’s priority, description, checklist and subtask"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "          onInstant={(tpl) => instant.mutate(tpl)}\n"
b = "          onInstant={(tpl) => setTemplateId(tpl.id)}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-1-instant-only-chooses: Create instantly chooses the template and makes nothing')
