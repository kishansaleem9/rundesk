# THE ENVELOPE WRAPS A FILE AGAIN: a PDF arrives as JSON describing the file, as it did.
# Reddens: file-exports: "and as a PDF: application/pdf, a file that begins %PDF-"
import io
p = '/home/user/rundesk/apps/api/src/common/interceptors/response.interceptor.ts'
a = '  if (body instanceof StreamableFile) return true\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fex-1-files-wrapped: applied")
