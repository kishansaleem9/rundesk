# EVERY READ LANDS (`found-5-oct/xlsx-read-as-text`): a file chosen earlier is read into the page after a later one.
# Reddens: unit: sheet-file.test.ts "only the last file chosen is read into the page: an earlier read that lands later is dropped"
import io
p = '/home/user/rundesk/apps/web/src/lib/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
a = '    isLatest: (turn: number): boolean => turn === latest,\n'
b = '    isLatest: (turn: number): boolean => turn > 0,\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sfl-6-every-read-is-the-latest-unit: every turn is the latest')
