# THE SURVIVOR'S EMPTIED ROW IS DELETED AND THE MERGED ROW MOVED IN ITS PLACE, as `mec-8`, for the unit tests of `moveFieldValues`
# (`found-6-oct/merge-drops-a-value-beside-an-emptied-one`, the review).
# Reddens: unit: tasks-merge-fields.test.ts "never deletes the survivor’s row: it takes the merged value where it is, and the merged task’s row then goes as it was read, the two in one transaction"
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
print("mec-9-the-survivors-row-is-deleted-unit: the survivor's emptied row is deleted and the merged row moved in its place")
