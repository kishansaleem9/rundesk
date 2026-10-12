# THE WORKSPACE’S GMAIL IS SEARCHED FOR EVERY MEMBER.
# (`found-23-sep/connected-search-per-person`)
# Reddens: connected-search: "a mailbox is personal: the Gmail Olga connected for the workspace is searched for her alone, and for Max it is not connected"
#
# One person’s mailbox answers anybody who searches.
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (source === 'gmail') return shared.connectedById === userId ? { token: shared.token, heldBy: 'you' } : null\n",
     '    // BROKEN: a mailbox for everyone\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccs-5-the-workspaces-mailbox-is-everyones: THE WORKSPACE’S GMAIL IS SEARCHED FOR EVERY MEMBER.')
