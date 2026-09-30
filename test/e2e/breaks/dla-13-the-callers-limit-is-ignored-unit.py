# THE CALLER'S LIMIT IS IGNORED (`found-30-sep/attachments-have-no-download-all`): the archive stops only at
# what ZIP32 can address, so objects that grew after they were sized are streamed on past the cap the route
# promised.
# Reddens: unit: zip-stream.test.ts "stops with a ZipLimitError past its limit, rather than write an archive it cannot finish"
import io
p = '/home/user/rundesk/apps/api/src/common/export/zip-stream.ts'
a = "  const maxBytes = Math.min(options.maxBytes ?? ZIP32_MAX_BYTES, ZIP32_MAX_BYTES)\n"
b = "  const maxBytes = ZIP32_MAX_BYTES\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-13-the-callers-limit-is-ignored-unit: maxBytes is not read')
