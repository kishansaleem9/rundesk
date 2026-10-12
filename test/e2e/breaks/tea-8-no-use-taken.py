# A SEND TAKES NO USE.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "sent from the Gmail, as the Gmail: its people, subject, words and file went through Google, not the server’s mail; kept as the task’s email with the mailbox and its thread, one use taken (read by SQL)"
#
# The use is checked but never counted.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      .set({ uses: sql`${emailAccounts.uses} + 1` })',
     '      .set({ uses: sql`${emailAccounts.uses}` })'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-8-no-use-taken: A SEND TAKES NO USE.')
