# THE FILL AND THE DELETE ARE NOT ONE TRANSACTION (`found-6-oct/merge-drops-a-value-beside-an-emptied-one`, the review): the merge
# deletes a row outside the transaction `mergeTask`'s own comment asks of any delete.
# Reddens: unit: tasks-merge-fields.test.ts "never deletes the survivor’s row: it takes the merged value where it is, and the merged task’s row then goes as it was read, the two in one transaction"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    return this.db.transaction(async (tx) => {\n      const [filled] = await tx\n"
b = "    // eslint-disable-next-line @typescript-eslint/no-explicit-any\n    return (async (tx: any) => { // BROKEN: no transaction\n      const [filled] = await tx\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = "      await tx.delete(v).where(and(eq(v.id, merged.id), eq(v.value, merged.value)))\n      return true\n    })\n"
b = "      await tx.delete(v).where(and(eq(v.id, merged.id), eq(v.value, merged.value)))\n      return true\n    })(this.db)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("mec-10-the-fill-and-the-delete-apart-unit: the fill and the delete run outside a transaction")
