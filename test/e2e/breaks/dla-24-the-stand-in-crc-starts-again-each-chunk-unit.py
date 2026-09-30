# THE STAND-IN CRC STARTS AGAIN AT EACH CHUNK (`found-30-sep/node-engines-below-zlib-crc32`): the writer
# carries an entry's CRC from one chunk of the store's stream to the next. A stand-in that ignores the value
# it is handed gives each chunk's CRC alone, so a file longer than one chunk is written with the wrong CRC.
# Reddens: unit: zip-stream.test.ts "agrees with zlib.crc32 over a whole buffer and over the same buffer fed in parts"
import io
p = '/home/user/rundesk/apps/api/src/common/export/zip-stream.ts'
a = "  let c = (value ^ 0xffffffff) >>> 0\n"
b = "  let c = 0xffffffff\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-24-the-stand-in-crc-starts-again-each-chunk-unit: the stand-in CRC ignores the value it is handed')
