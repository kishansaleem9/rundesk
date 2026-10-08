# AN IMPORTED COMMENT IS FILED UNDER WHICHEVER MEMBER'S NAME MATCHES ITS CLICKUP AUTHOR (`found-6-oct/enrichment-files-comments-under-a-matched-name`).
#
# A comment goes in under a member only when ClickUp's author has that
# member's email. Index the members by display name as well, and look the
# author up by name when the address finds nobody, as the enrichment did, and
# a ClickUp author who only has a member's name is filed as that member.
#
# Reddens: unit: clickup-import.enrich.test.ts "a ClickUp author who has only a member’s name is not that member: the comment is the importer’s, its author named in it"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
pairs = [
    ("      .select({ userId: users.id, email: users.email })\n      .from(workspaceMembers)\n      .innerJoin(users, eq(users.id, workspaceMembers.userId))\n      .where(eq(workspaceMembers.workspaceId, workspaceId))\n    const byEmail = new Map<string, string>()\n    for (const m of memberRows) if (m.email) byEmail.set(m.email.trim().toLowerCase(), m.userId)\n",
     "      .select({ userId: users.id, email: users.email, displayName: users.displayName })\n      .from(workspaceMembers)\n      .innerJoin(users, eq(users.id, workspaceMembers.userId))\n      .where(eq(workspaceMembers.workspaceId, workspaceId))\n    const byEmail = new Map<string, string>()\n    for (const m of memberRows) {\n      if (m.displayName) byEmail.set(m.displayName.trim().toLowerCase(), m.userId)\n      if (m.email) byEmail.set(m.email.trim().toLowerCase(), m.userId)\n    }\n"),
    ("    const resolvedAuthor = (emailKey ? memberByEmail.get(emailKey) : undefined) ?? null\n",
     "    const nameKey = c.user?.username?.trim().toLowerCase()\n    const resolvedAuthor = (emailKey ? memberByEmail.get(emailKey) : undefined) ?? (nameKey ? memberByEmail.get(nameKey) : undefined) ?? null\n"),
]
s = io.open(p, encoding='utf-8').read()
for a, b in pairs:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('enr-1-a-comment-is-filed-under-a-matched-name-unit: a comment is filed under a name')
