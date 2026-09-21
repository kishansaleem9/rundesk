# Quotes inside a cell stop being doubled, so a title carrying one ends its own
# field early and every column after it moves by one. The file still opens and
# still looks like a spreadsheet; one row in it is silently wrong.
#
# Reddens: list-export: "and a title with commas and quotes stays one cell"
import io
p = '/home/user/rundesk/apps/api/src/common/export/csv.ts'
a = '  return `"${text.replace(/"/g, \'""\')}"`\n'
b = '  return `"${text}"`\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csv.ts: quotes inside a cell are no longer doubled.')
