# A ZIP ENTRY'S CRC IS NOT CHECKED: damaged bytes are read as the file.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: unit: zip-read.test.ts "checks what comes out: a wrong CRC, and a size that does not match, are refused"
import io
p = '/home/user/rundesk/apps/api/src/common/import/zip-read.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if ((crc32(out) >>> 0) !== crc) throw new ZipReadError(`"${name}" is damaged: its checksum does not match`)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-u1-a-zip-checksum-unchecked: no CRC check')
