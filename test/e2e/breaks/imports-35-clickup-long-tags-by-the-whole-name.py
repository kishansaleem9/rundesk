# THE CLICKUP IMPORT LOOKS A LONG TAG UP BY A NAME NO TAG HAS (`found-30-sep/spreadsheet-import-skips-task-rules`): a tag is made cut to 60 characters and
# looked up by the whole name, so a 70-character tag in another case makes a twin, and in the same case is dropped.
# Reddens: imports: "a ClickUp row tagged with a 70-character tag, in another case or the same, is tagged with the one tag the import made — no twin differing only in case, and none dropped"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    sql`lower(${labels.name}) in (lower(${full}), lower(${stored}))`,\n'
b = '    sql`lower(${labels.name}) = lower(${full})`,\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-35-clickup-long-tags-by-the-whole-name: a tag is looked up by the whole name only')
