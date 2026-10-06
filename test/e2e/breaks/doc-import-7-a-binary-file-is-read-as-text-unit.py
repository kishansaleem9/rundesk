# A FILE THAT IS NOT TEXT IS READ AS TEXT, asked of the service itself: its NULs go on to the database.
# Reddens: unit: docs-import.test.ts "refuses a zip and a file holding a NUL, named .md, in the import panel’s words, before anything is asked"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    if (raw.includes('\\u0000')) throw new BadRequestException(DOC_IMPORT_ACCEPTS)\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('doc-import-7-a-binary-file-is-read-as-text-unit: a binary file is read as text')
