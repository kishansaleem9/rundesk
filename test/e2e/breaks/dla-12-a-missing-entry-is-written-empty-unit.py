# AN ENTRY WITH NOTHING TO READ IS WRITTEN EMPTY (`found-30-sep/attachments-have-no-download-all`): a file
# whose object is gone from the store goes into the zip as a file of no bytes under its name, where it
# should be left out.
# Reddens: unit: zip-stream.test.ts "leaves out an entry with nothing to read, and the archive is still whole"
import io
p = '/home/user/rundesk/apps/api/src/common/export/zip-stream.ts'
a = "    if (opened === null) continue\n    const source = asStream(opened)\n"
b = "    const source = asStream(opened ?? new Uint8Array(0))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-12-a-missing-entry-is-written-empty-unit: an entry that opens to nothing is written empty')
