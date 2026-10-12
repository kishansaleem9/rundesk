# A FREE PLAN’S MAILBOX NEVER RUNS OUT.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "on Free a mailbox sends its 100 emails and then is refused in words, nothing sent; and Free does not schedule (403)"
#
# The use is taken without asking whether one is left.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('.where(and(eq(emailAccounts.id, a.id), email.uses === null ? sql`true` : sql`${emailAccounts.uses} < ${email.uses}`))',
     '.where(and(eq(emailAccounts.id, a.id), sql`true`))'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-15-uses-unlimited: A FREE PLAN’S MAILBOX NEVER RUNS OUT.')
