# TO THE BOTTOM WHENEVER THE COUNT CHANGES, as it was: loading older history throws the reader
# back to the newest message.
# Reddens: chat-history: "scrolling to the top loads the next hundred — and the message that was at the top is still in view"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = '  }, [newestId, selectedId])\n'
b = '  }, [messages.length, selectedId])\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-10-bottom-on-any-change: applied")
