# OLDER MESSAGES LAND AND THE VIEW DOES NOT MOVE WITH THEM: what you were reading is pushed a
# page down, out of sight.
# Reddens: chat-history: "scrolling to the top loads the next hundred — and the message that was at the top is still in view"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = '    el.scrollTop = before.top + (el.scrollHeight - before.height)\n'
b = '    el.scrollTop = before.top\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-9-place-not-kept: applied")
