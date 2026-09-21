import io, sys
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a = """      .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.isArchived, false)))
      .orderBy(asc(workspaceMembers.joinedAt))
  }"""
if s.count(a) != 1:
    sys.exit('anchor %d times' % s.count(a))
s = s.replace(a, """      .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.isArchived, false)))
  }""")
io.open(p, 'w', encoding='utf-8').write(s)
print('removed the orderBy from findByMember')
