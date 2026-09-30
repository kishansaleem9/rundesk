# THE TEMPLATE CHOSEN UNDER USE TEMPLATE IS SHOWN, AND THE SUBMIT IGNORES IT.
#
# The button says the template is in use, and Create task makes a plain task
# from the form: no checklist, no subtask, the form's own priority. The choice
# is a label with nothing behind it.
#
# Reddens: create-modal-templates: "with a template chosen under Use Template, Create task makes the task from it: the typed title, and the template’s priority, description, checklist and subtask, in the chosen list"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "      const task = templateId\n        ? await instantiate(templateId, title)\n"
b = "      const task = false && templateId\n        ? await instantiate(templateId, title)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-5-submit-ignores-the-choice: the submit makes a plain task whatever was chosen')
