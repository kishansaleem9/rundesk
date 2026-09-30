# EACH PART OF THE WORKBOOK IS DATED NOW (`found-30-sep/two-zip-writers`): the parts are handed to the one
# zip writer with the time of the export, so two exports of the same list differ in every entry's header,
# and a change in the bytes no longer says the data or the code changed.
# Reddens: unit: xlsx.test.ts "writes the same bytes for the same rows: every entry is dated 1980-01-01, not now"
import io
p = '/home/user/rundesk/apps/api/src/common/export/xlsx.ts'
a = "({ name, method: 'deflate' as const, open: async () => Buffer.from(xml, 'utf8') })"
b = "({ name, method: 'deflate' as const, modifiedAt: new Date(), open: async () => Buffer.from(xml, 'utf8') })"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tzw-1-each-part-is-dated-now-unit: every part of the workbook is dated at the export')
