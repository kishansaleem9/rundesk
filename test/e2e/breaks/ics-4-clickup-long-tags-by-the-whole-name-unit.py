# THE CLICKUP IMPORT LOOKS A LONG TAG UP BY A NAME NO TAG HAS (`found-30-sep/spreadsheet-import-skips-task-rules`).
# Reddens: unit: clickup-import.service.test.ts "a tag over 60 characters is looked up by the name it is stored under as well, made under it, and found again after a conflict"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    sql`lower(${labels.name}) in (lower(${full}), lower(${stored}))`,\n'
b = '    sql`lower(${labels.name}) = lower(${full})`,\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ics-4-clickup-long-tags-by-the-whole-name-unit: a tag is looked up by the whole name only')
