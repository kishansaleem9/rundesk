# CREATE INSTANTLY FROM TEMPLATE THROWS AWAY THE TITLE THAT WAS TYPED.
#
# The task is made from the template under the template's own title, whatever
# is in the title box: the one thing the person had already said about the
# task is dropped without a word.
#
# Reddens: create-modal-templates: "Create instantly from template makes the task the moment one is chosen, with no submit: in the chosen list, under the typed title, with the template’s priority, description, checklist and subtask"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    mutationFn: (template: TaskTemplate) => instantiate(template.id, title),\n"
b = "    mutationFn: (template: TaskTemplate) => instantiate(template.id, ''),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-11-instant-drops-the-typed-title: the typed title is not sent')
