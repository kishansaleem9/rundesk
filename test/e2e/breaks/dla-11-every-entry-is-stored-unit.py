# EVERY ENTRY IS STORED (`found-30-sep/attachments-have-no-download-all`): the method an entry asks for is
# ignored, so a task's text files go into the zip at their full size.
# Reddens: unit: zip-stream.test.ts "stores an entry that asks to be stored and deflates one that asks to be deflated"
import io
p = '/home/user/rundesk/apps/api/src/common/export/zip-stream.ts'
a = "    const method = METHOD_CODE[entry.method ?? 'store']\n"
b = "    const method = METHOD_CODE['store']\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-11-every-entry-is-stored-unit: no entry is deflated')
