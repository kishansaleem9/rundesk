# A PRIVATE TEMPLATE IS OFFERED TO EVERYBODY.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "a template shared with everybody is offered to Mia, the owner’s own is not, and Mia may not delete the owner’s (403, in words)"
#
# Whether a template is shared is not asked.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('.where(and(eq(emailTemplates.workspaceId, workspaceId), or(eq(emailTemplates.createdById, userId), eq(emailTemplates.shared, true))))',
     '.where(and(eq(emailTemplates.workspaceId, workspaceId), sql`true`))'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-19-private-templates-shared: A PRIVATE TEMPLATE IS OFFERED TO EVERYBODY.')
