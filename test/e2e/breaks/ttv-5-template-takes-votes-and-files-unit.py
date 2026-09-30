# A TASK SAVED AS A TEMPLATE TAKES ITS VOTES AND FILES WITH IT
# (`found-30-sep/templates-null-array-field-values`): the payload carries fields no task made from it may be given.
# Reddens: unit: task-templates.service.test.ts "keeps a task's People and Labels lists when it is saved as a template, and leaves out its votes and files"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "        .filter((r) => !forTemplate || !NOT_FROM_TEMPLATES.has(r.type))\n"
b = "        // BROKEN: a template takes every field, votes and files too\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ttv-5-template-takes-votes-and-files-unit: a saved task keeps its votes and files in the template')
