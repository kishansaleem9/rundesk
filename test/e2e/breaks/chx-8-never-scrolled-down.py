# A CHANNEL THAT OPENS AT ITS TOP: the newest message is off screen and the older-page control
# is in view on arrival.
# Reddens: chat-history: "the channel opens on its newest hundred, the newest message in view"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = '    if (!scrollRef.current) return\n    scrollRef.current.scrollTop = scrollRef.current.scrollHeight\n    if (newestId) setBottomedFor(selectedId)\n'
b = '    if (!scrollRef.current) return\n    if (newestId) setBottomedFor(selectedId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-8-never-scrolled-down: applied")
