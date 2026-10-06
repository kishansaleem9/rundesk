# A FIRST LINE HOLDING NULS IS TAKEN FOR TEXT (`found-5-oct/xlsx-read-as-text`): a legacy .xls is no zip, and nothing else is asked.
# Reddens: unit: spreadsheet-import.util.test.ts "holds a NUL in its first line when it is a legacy .xls read as text — and a NUL in a later row is that row’s own"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "  const head = ends.length ? content.slice(0, Math.min(...ends)) : content\n  return head.includes('\\u0000')\n"
b = '  const head = ends.length ? content.slice(0, Math.min(...ends)) : content\n  return head.length < 0\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isu-7-a-nul-header-is-text-unit: no first line holds a NUL')
