# WHAT IS WRITTEN TO THE JOB ROW KEEPS ITS NULS (`found-5-oct/xlsx-read-as-text`): jsonb refuses them.
# Reddens: unit: spreadsheet-import.util.test.ts "holds no NUL: each one, however deep, is written as U+FFFD — and nothing else changes"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (typeof value === 'string') return value.split('\\u0000').join('\\uFFFD') as T\n"
b = "  if (typeof value === 'string') return value\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isu-8-a-nul-is-stored-as-is-unit: a NUL is written as it is')
