# THE TEMPLATE CENTER'S APPLY SAYS ONLY THAT THE TASK WAS MADE AGAIN, though the
# answer names the values left out (`found-30-sep/template-leaves-values-out-silently`).
# Reddens: create-modal-templates: "and so does the Template Center’s Apply: applied into that list, it makes the task and its toast names the Estimate, the Severity and the Contact as not applied, and not the Note"
import io
p = '/home/user/rundesk/apps/web/src/components/task-templates-section.tsx'
a = "      const leftOut = made.valuesLeftOut ?? []\n      if (leftOut.length) {\n"
b = "      const leftOut = made.valuesLeftOut ?? []\n      if (leftOut.length < 0) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-34-the-centre-says-only-made: Apply never warns')
