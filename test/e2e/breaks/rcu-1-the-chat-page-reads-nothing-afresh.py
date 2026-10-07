# THE CHAT PAGE'S ROOM IS ANSWERED, AND THE PAGE READS NOTHING AFRESH (`found-7-oct/a-room-asked-on-an-open-socket-misses-what-was-said`).
#
# The chat page asks for its workspace's room and, once the server holds it,
# reads afresh what the room's events refresh. Let the answer read nothing, as
# before, and a message posted while the server was letting the socket in is
# never shown without a reload — on a socket already open, and on one that was
# down when the page was opened.
#
# Reddens: room-catch-up:
#   "a page that asks for its room on a socket already open shows what was said while the server let it in, without a reload"
#   "a page opened while the socket is down shows what was said before it opened again, without a reload"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = "      for (const queryKey of [['chat-messages'], ['chat-thread'], ['chat-channel-members'], ['chat-channels', workspaceId], ['chat-archived-channels', workspaceId]]) {\n"
b = "      for (const queryKey of [] as string[][]) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rcu-1-the-chat-page-reads-nothing-afresh: the chat page’s answer reads nothing afresh')
