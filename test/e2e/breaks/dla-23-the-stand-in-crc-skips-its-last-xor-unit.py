# THE STAND-IN CRC SKIPS ITS LAST XOR (`found-30-sep/node-engines-below-zlib-crc32`): where Node has no
# `zlib.crc32` (20 before 20.15), the table-driven CRC that stands in returns its register uninverted, so
# every entry's CRC is wrong and a reader refuses each file as damaged.
# Reddens: unit: zip-stream.test.ts "agrees with zlib.crc32 over a whole buffer and over the same buffer fed in parts"
import io
p = '/home/user/rundesk/apps/api/src/common/export/zip-stream.ts'
a = "  return (c ^ 0xffffffff) >>> 0\n}\nconst nodeCrc32"
b = "  return c >>> 0\n}\nconst nodeCrc32"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-23-the-stand-in-crc-skips-its-last-xor-unit: the stand-in CRC returns its register uninverted')
