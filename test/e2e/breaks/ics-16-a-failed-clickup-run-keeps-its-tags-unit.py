# A CLICKUP RUN DOES NOT RECORD THE TAGS IT MAKES.
# Reddens: unit: clickup-import.service.test.ts "a run whose last write is refused takes away what it made — its project, its space and the tags it made — and its job is marked failed, having created nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
a = '        madeLabels?.push(id)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ics-16-a-failed-clickup-run-keeps-its-tags-unit: the tags a run makes are not recorded')
