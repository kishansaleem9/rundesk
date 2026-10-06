# A FILE THAT IS NOT TEXT IS READ AS TEXT, whatever it holds: its NULs reach the database, a 500.
# Reddens: doc-import: "a file that is not text, called .md — an .xlsx’s bytes or a legacy .xls’s — is refused in the page’s own words, and no doc is made from it"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    if (raw.includes('\\u0000')) throw new BadRequestException(DOC_IMPORT_ACCEPTS)\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('doc-import-6-a-binary-file-is-read-as-text: a binary file is read as text')
