# A CONFLUENCE PAGE THE TREE NAMES AND THE ZIP LACKS IS DROPPED UNSAID.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: unit: confluence-export.test.ts "reads each page’s title and words, parents before children, as the index nests them"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/confluence-export.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const root = read(file)\n    if (!root) {\n      missing.push(file)\n      return\n    }',
     '    const root = read(file)\n    if (!root) {\n      return\n    }'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-u9-a-missing-page-not-named: a missing page is not named')
