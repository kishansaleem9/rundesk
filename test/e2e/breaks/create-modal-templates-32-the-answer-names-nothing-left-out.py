# A TEMPLATE'S VALUES ITS FIELDS WOULD NOT TAKE ARE LEFT OUT IN SILENCE AGAIN
# (`found-30-sep/template-leaves-values-out-silently`): the answer names none,
# so the modal and the Template Center have nothing to say.
# Reddens: create-modal-templates: "and the answer names each value it left out, with why: the Estimate, the Severity and the Contact, each in its field route’s own words, and not the Note it wrote"
#          create-modal-templates: "and the modal says so: Create instantly from that template, in that list, makes the task and names the Estimate, the Severity and the Contact as not applied, and not the Note"
#          create-modal-templates: "and so does the Template Center’s Apply: applied into that list, it makes the task and its toast names the Estimate, the Severity and the Contact as not applied, and not the Note"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "    if (rows.length) await this.db.insert(customFieldValues).values(rows)\n    return leftOut\n"
b = "    if (rows.length) await this.db.insert(customFieldValues).values(rows)\n    return leftOut.slice(leftOut.length)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-32-the-answer-names-nothing-left-out: valuesLeftOut is always empty')
