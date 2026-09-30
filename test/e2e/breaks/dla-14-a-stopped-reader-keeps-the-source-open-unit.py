# A STOPPED READER KEEPS A STORED ENTRY'S SOURCE OPEN (`found-30-sep/attachments-have-no-download-all`): when
# the browser goes away mid-download, the store's response for the file being written is left open, holding
# its connection.
# Reddens: unit: zip-stream.test.ts "lets an entry’s source go when its reader stops early"
import io
p = '/home/user/rundesk/apps/api/src/common/export/zip-stream.ts'
a = "  for await (const chunk of source) {\n"
b = "  for await (const chunk of source.iterator({ destroyOnReturn: false })) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-14-a-stopped-reader-keeps-the-source-open-unit: a stored entry iterates its source without destroying it on return')
