# DIRECT MESSAGES TURNED OFF ARE READ ANYWAY.
# (`found-14-oct/clickup-chat-unimported`; RE-AIMED 14 October, `found-14-oct/clickup-import-rest-unimported`:
# direct messages come in now, between the same people, unless the import page's choice turns them off)
# Reddens: unit: apps/api/src/modules/integrations/app-import/clickup.test.ts "Chat is read whole: every page of channels and of messages, each thread’s replies after its first message, oldest first; direct messages turned off are not read"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      if (!c?.id || (type !== 'CHANNEL' && !dm) || (dm && !dms)) continue\n",
     "      if (!c?.id || (type !== 'CHANNEL' && !dm)) continue\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-35-chat-direct-messages-read: DIRECT MESSAGES TURNED OFF ARE READ ANYWAY.')
