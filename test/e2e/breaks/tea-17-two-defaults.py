# A NEW DEFAULT SIGNATURE LEAVES THE OLD ONE DEFAULT.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "a person keeps signatures, one of them the default — made the default, the other is not (read by SQL); they are theirs alone, and on Pro there are none (403, in words)"
#
# The other signatures are not unmarked.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        await tx.update(emailSignatures).set({ isDefault: false }).where(and(eq(emailSignatures.workspaceId, workspaceId), eq(emailSignatures.userId, actor.id)))\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-17-two-defaults: A NEW DEFAULT SIGNATURE LEAVES THE OLD ONE DEFAULT.')
