# SIGN-UP'S CHAT PICK WRITES AN ANNOUNCEMENTS SWITCH AGAIN: the flag is back in the registry and in Chat's category.
# Reddens: announcement-views: "a newcomer who picks Chat at sign-up gets its switches and no Announcements switch among them"
import io
p = '/home/user/rundesk/packages/feature-flags/src/registry.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  CHAT_INBOX: 'chat.inbox',\n", "  CHAT_INBOX: 'chat.inbox',\n  CHAT_ANNOUNCEMENTS: 'chat.announcements',\n"),
    (", FLAGS.CHAT_INBOX],", ", FLAGS.CHAT_INBOX, FLAGS.CHAT_ANNOUNCEMENTS],"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('anv-10-signup-writes-the-flag: the Announcements flag is back in Chat')
