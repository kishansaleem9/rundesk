# THE UPDATE PANEL PROMISES THE TEMPLATE'S CHECKLISTS AND SUBTASKS AND SAYS NOTHING OF ITS CUSTOM FIELDS
# (`found-30-sep/templates-null-array-field-values`), as it did while a list-valued field was lost.
#
# Reddens: create-modal-templates: "the Update panel says, before it is pressed, that the template keeps its checklists, subtasks and custom-field values"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = "  'quickCreate.templateUpdateHint': \"The title, description, priority, estimate, dates (as days from today) and tags entered here replace the template's; its checklists, subtasks and custom-field values are kept. This cannot be undone.\",\n"
b = "  'quickCreate.templateUpdateHint': \"The title, description, priority, estimate, dates (as days from today) and tags entered here replace the template's; its checklists and subtasks are kept. This cannot be undone.\",\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-17-panel-promises-checklists-only: the Update panel names checklists and subtasks only')
