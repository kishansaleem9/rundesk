# GMAIL IS NOT ASKED TO LET DRAFTS BE LEFT.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "linking Gmail asks Google to send, to leave drafts and to read — and the mailbox is kept with the draft grant (read by SQL)"
#   or "confirmed, the email is a draft in her own Gmail — to the client, copying Mia, its subject and words — nothing is sent, and the result says where it is"
#   or "a draft is written only in a mailbox its asker linked: one naming Olga’s, sent by Mia, is refused in words and her mailbox is untouched"
#
# Its third claim stands on what the first two broke: with no draft left in her mailbox, the forged one's check finds
# none to be untouched. Measured on lane 10, 13 October: 8 of 11, the three named.
#
# The mailbox is linked to send and read; a draft asked of it is refused as needing the mailbox linked again.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      gmail: purpose === 'email' ? `${GMAIL_SEND_SCOPE} ${GMAIL_DRAFT_SCOPE} ${GMAIL_SEARCH_SCOPE}` : GMAIL_SEARCH_SCOPE,\n",
     "      gmail: purpose === 'email' ? `${GMAIL_SEND_SCOPE} ${GMAIL_SEARCH_SCOPE}` : GMAIL_SEARCH_SCOPE,\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-7-no-draft-grant: the mailbox consent leaves out drafts')
