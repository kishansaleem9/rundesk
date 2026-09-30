# THE NOTE BESIDE A CHOSEN TEMPLATE NAMES NOTHING THAT WAS SET
# (`found-30-sep/template-submit-ignores-the-form`): with priority and a due date
# set, it still says everything comes from the template, so nothing on screen
# says which of the person's values win over it.
#
# Reddens: create-modal-templates: "with a template chosen, the modal says before Create that its checklists, subtasks and custom-field values come with the task and that what is set here wins over it — naming Priority and Due once they are set — with a typed description first and tags and assignees added to its own"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "          wins={setOverTemplate}\n"
b = "          wins={[]}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-21-the-note-names-nothing-set: the note never names what was set')
