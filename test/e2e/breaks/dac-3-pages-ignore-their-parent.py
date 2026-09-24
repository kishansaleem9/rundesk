# EACH DOC JUDGED BY ITS OWN SPACE ALONE: a page made with no space is never hidden.
# Reddens: unit: doc-access.test.ts "hides a page with no space of its own when the doc above it is in a refused space, however deep"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/doc-access.ts'
a = '      cursor = row.parentDocId\n    }\n    // Back down'
b = '      cursor = null\n    }\n    // Back down'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dac-3-pages-ignore-their-parent: applied")
