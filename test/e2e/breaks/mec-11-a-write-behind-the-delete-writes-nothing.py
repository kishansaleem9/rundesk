# A WRITE WHOSE ROW WENT BETWEEN ITS READ AND ITS WRITE UPDATES NOTHING AND SAYS 200, as it did (`found-6-oct/merge-drops-a-value-beside-an-emptied-one`,
# the review): a value typed into the merged task's field, queued behind the merge's delete of that row, is held nowhere.
# Reddens: task-merge: "and one typed into the merged task’s own field, queued behind the merge’s delete of that task’s row, is written all the same: the survivor holds the merged value, and the binned task the typed one (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "      if (row) return row\n"
b = "      return row // BROKEN: a row gone by the write is answered as written\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mec-11-a-write-behind-the-delete-writes-nothing: a value whose row went before the write is written nowhere")
