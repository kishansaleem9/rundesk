# GMAIL IS ASKED ONLY TO READ.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "a Gmail is linked through Google’s consent, asked to send and read mail, and comes back to the Email settings — kept as the owner’s, under their name (read by SQL)"
#   or "the Email settings list the workspace’s mailboxes to its owner, and the sender name is changed there (read by SQL); Link Gmail goes to Google’s consent asking to send, and a refused consent is said on return"
#
# A mailbox is linked with the search scope, which cannot send.
#
# Re-aimed 13 October: the mailbox's consent asks to leave drafts too (`ledger-rows/row-2294`).
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      gmail: purpose === 'email' ? `${GMAIL_SEND_SCOPE} ${GMAIL_DRAFT_SCOPE} ${GMAIL_SEARCH_SCOPE}` : GMAIL_SEARCH_SCOPE,",
     '      gmail: GMAIL_SEARCH_SCOPE,'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-1-gmail-asked-to-search-only: GMAIL IS ASKED ONLY TO READ.')
