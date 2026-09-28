# A DELETED LIST RECORDS NO DELETER: it is not in the Trash of whoever deleted it.
# Reddens: container-delete-keys: "a member granted list.delete deletes a list another member made where they hold Full edit, and it is in their Trash — a plain member, and one granted only project.delete, are refused it (403) and it stays until then"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "  async deleteList(listId: string, actorId?: string, ipAddress?: string) {\n    const ctx = actorId ? await this.assertManageable(listId, actorId, 'delete') : null\n    await this.db\n      .update(lists)\n      .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })\n"
b = "  async deleteList(listId: string, actorId?: string, ipAddress?: string) {\n    const ctx = actorId ? await this.assertManageable(listId, actorId, 'delete') : null\n    await this.db\n      .update(lists)\n      .set({ isArchived: true, archivedAt: new Date(), archivedById: null, updatedAt: new Date() })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cdk-14-deleted-list-not-theirs: deleteList records no deleter')
