# THE SURVIVOR'S EMPTIED ROW IS DELETED AND THE MERGED ROW MOVED IN ITS PLACE, as the first fix did — only as it was read,
# in one transaction (`found-6-oct/merge-drops-a-value-beside-an-emptied-one`, the review): a value typed into the survivor's
# field just after the merge's delete finds no row, and the row it makes runs into the merged row moved there (409); and the merged
# task's row, moved rather than deleted, takes a value typed into that task onto the survivor.
# Reddens: task-merge: "and one queued just behind the merge’s write lands on the survivor’s row, which is still there: the merge counts the merged value moved, the typed one is written over it, and the binned task holds none (read by SQL)"
#   and "and one typed into the merged task’s own field, queued behind the merge’s delete of that task’s row, is written all the same: the survivor holds the merged value, and the binned task the typed one (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = ("      const [filled] = await tx\n"
     "        .update(v)\n"
     "        .set({ value: merged.value, updatedAt: new Date() })\n"
     "        .where(and(eq(v.id, survivors.id), eq(v.value, survivors.value)))\n"
     "        .returning({ id: v.id })\n"
     "      if (!filled) return false\n"
     "      await tx.delete(v).where(and(eq(v.id, merged.id), eq(v.value, merged.value)))\n")
b = ("      // BROKEN: the survivor's row is deleted, as it was read, and the merged task's row moved in its place\n"
     "      const [gone] = await tx.delete(v).where(and(eq(v.id, survivors.id), eq(v.value, survivors.value))).returning({ id: v.id })\n"
     "      if (!gone) return false\n"
     "      await tx.update(v).set({ taskId: (survivors as unknown as { taskId: string }).taskId }).where(eq(v.id, merged.id))\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mec-8-the-survivors-row-is-deleted: the survivor's emptied row is deleted and the merged row moved in its place")
