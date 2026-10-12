# A GUEST LINKS A MAILBOX.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "a guest links no mailbox and reads no Email settings (403, in words), and only Gmail or Outlook is linked to send from (400)"
#
# Neither the Email gate nor the start of a mailbox's consent asks the role.
#
# BOTH, ON PURPOSE. Measured 12 October on lane 8: with only the consent's check
# gone the suite stayed 19 of 19, because the Email gate (`EmailAccountsService.gate`)
# refuses a guest first, in the same words. Two independent refusals keep a guest
# out, and a patch that removes one proves nothing.
import io
for p, a, b in [
    ('/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts',
     "      if (member?.role === 'guest') throw new ForbiddenException(EMAIL_ACCOUNT_REFUSALS.guest)\n",
     ''),
    ('/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts',
     "    if (member.role === 'guest') throw new ForbiddenException(EMAIL_ACCOUNT_REFUSALS.guest)\n",
     ''),
]:
    s = io.open(p, encoding='utf-8').read()
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tea-4-guests-link: A GUEST LINKS A MAILBOX.')
