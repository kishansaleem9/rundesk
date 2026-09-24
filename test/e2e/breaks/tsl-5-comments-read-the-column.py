# A COMMENT READS THE SPACE'S DEFAULT AND NOTHING ELSE: a grant of "edit" on the space does not count.
# Reddens: task-space-levels: "a member given “edit” on the view-only space comments and renames their task there — the grant wins over the default"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await assertSpaceLevel(this.db, { spaceId: row.spaceId, actorId, required: 'comment', kind: 'comments' })\n"
b = "    const [space] = await this.db.select({ level: spaces.defaultPermission }).from(spaces).where(eq(spaces.id, row.spaceId)).limit(1)\n    if (space?.level === 'view') throw new ForbiddenException('This space is view only')\n    void assertSpaceLevel\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsl-5-comments-read-the-column: applied")
