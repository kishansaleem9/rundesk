# A WRITE WHOSE ROW WENT BETWEEN ITS READ AND ITS WRITE UPDATES NOTHING AND SAYS 200, as `mec-11`, for the unit tests of `setValue`
# (`found-6-oct/merge-drops-a-value-beside-an-emptied-one`, the review).
# Reddens: unit: custom-fields.service.test.ts "writes the value afresh when the row it read is gone by the time it writes, and answers with what it wrote"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "      if (row) return row\n"
b = "      return row // BROKEN: a row gone by the write is answered as written\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mec-12-a-write-behind-the-delete-writes-nothing-unit: a value whose row went before the write is written nowhere")
