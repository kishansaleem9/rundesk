# A DRAFT IS WRITTEN IN ANY MAILBOX THE BODY NAMES.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "a draft is written only in a mailbox its asker linked: one naming Olga’s, sent by Mia, is refused in words and her mailbox is untouched"
#
# Mia names Olga's mailbox and her draft lands in Olga's Drafts.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (a.ownerId !== actor.id) throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.notYourDrafts)\n',
     "    if (a.ownerId !== actor.id && a.ownerId === '') throw new ForbiddenException(EMAIL_ACCOUNTS_REFUSALS.notYourDrafts)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-5-drafts-in-anyones-mailbox: a draft is written in a mailbox its asker did not link')
