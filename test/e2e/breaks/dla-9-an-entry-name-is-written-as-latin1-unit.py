# AN ENTRY'S NAME IS WRITTEN AS LATIN-1 (`found-30-sep/attachments-have-no-download-all`): the name's bytes are
# not UTF-8 though the entry says they are (bit 11), so a file named in Arabic or Urdu unpacks under a name
# of stray characters. An ASCII name is the same bytes either way.
# Reddens: unit: zip-stream.test.ts "writes an archive unzip reads back: each entry’s name and bytes, in the order given, every CRC right"
import io
p = '/home/user/rundesk/apps/api/src/common/export/zip-stream.ts'
a = "    const name = Buffer.from(entry.name, 'utf8')\n"
b = "    const name = Buffer.from(entry.name, 'latin1')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-9-an-entry-name-is-written-as-latin1-unit: entry names are written as Latin-1')
