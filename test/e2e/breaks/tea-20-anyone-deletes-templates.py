# ANYBODY DELETES A TEMPLATE.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "a template shared with everybody is offered to Mia, the owner’s own is not, and Mia may not delete the owner’s (403, in words)"
#
# Its maker is not asked before it goes.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const t = await this.templateIn(workspaceId, templateId)\n    if (t.createdById !== actor.id && !isAdminRole(role)) throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.notYourTemplate)\n    await this.db.delete(emailTemplates)',
     '    const t = await this.templateIn(workspaceId, templateId)\n    await this.db.delete(emailTemplates)'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-20-anyone-deletes-templates: ANYBODY DELETES A TEMPLATE.')
