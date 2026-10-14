# A FILES FIELD IS LEFT OUT.
# (`found-14-oct/clickup-import-rest-unimported`)
# Reddens: clickup-workspace-import: "a Files field comes in as a Files field, holding its file — which is the task’s own file too, with its bytes"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (!files.length || !fetchFile) return null\n',
     '      if (files.length || !fetchFile) return null\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-39-files-field-left-out: A FILES FIELD IS LEFT OUT.')
