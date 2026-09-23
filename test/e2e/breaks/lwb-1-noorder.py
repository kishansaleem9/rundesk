# IT NAMED A CHECK THAT PASSES.
# It named "the older membership comes first", which passes: the list really is
# ordered by membership age. What falls is the check after it — a RENAME
# reordering the list, which is the defect, because an UPDATE is not a
# membership event and must not move anything.
#
# Reddens: login-workspace-binding: "renaming the older workspace does not move it behind the newer one"
# Re-anchored 23 September: `findByMember` now maps its rows through
# `withoutDomainToken` (credential-reads), so the query is followed by a
# `return rows.map(` rather than the closing brace. Same break: no ORDER BY.
import io, sys
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a = """      .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.isArchived, false)))
      .orderBy(asc(workspaceMembers.joinedAt))
    return rows.map("""
if s.count(a) != 1:
    sys.exit('anchor %d times' % s.count(a))
s = s.replace(a, """      .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.isArchived, false)))
    return rows.map(""")
io.open(p, 'w', encoding='utf-8').write(s)
print('removed the orderBy from findByMember')
