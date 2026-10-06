# A CLICKUP RUN DOES NOT RECORD THE TAGS IT MAKES, so a run that fails leaves them.
# Reddens: imports: "a ClickUp import the database refuses at its last write ends failed and leaves nothing behind: no space, project, list, task or tag of it is there"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
a = '        madeLabels?.push(id)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('imports-73-a-failed-clickup-run-keeps-its-tags: the tags a run makes are not recorded')
