# A NAME KEEPS ITS RUNS OF DOTS (`found-30-sep/attachments-have-no-download-all`): a separator is still made
# `_`, but `..` is left in the name, which a reader that splits on either separator reads as the folder above.
# Reddens: unit: zip-names.test.ts "leaves no path separator and no .. in a name, nor anything a file system refuses"
import io
p = '/home/user/rundesk/apps/api/src/common/export/zip-names.ts'
a = "  name = name.replace(UNSAFE, '_').replace(/\\.{2,}/g, '.').trim()\n"
b = "  name = name.replace(UNSAFE, '_').trim()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-15-a-name-keeps-its-dot-runs-unit: .. is left in a name')
