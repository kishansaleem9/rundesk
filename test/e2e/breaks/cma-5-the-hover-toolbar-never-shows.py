# THE MESSAGE'S HOVER TOOLBAR NEVER SHOWS: IT STAYS AT OPACITY 0 UNDER THE POINTER AND WITH THE FOCUS INSIDE THE ROW.
#
# The toolbar is always in the DOM, at opacity 0, and `group-hover` and
# `group-focus-within` are what show it. This drops both, so hovering a message
# reveals nothing: no reactions, no Assign, no Save, no `⋯`.
#
# Every control on it still exists, still has a box and still takes a click —
# Playwright counts an element at opacity 0 as visible and clicks straight
# through it — so every check that PRESSES something on the toolbar (Assign, the
# reminder, the mute, Copy link, Forward, the ✅ reaction, Save itself) goes on
# passing, correctly: what those check is what the press does. Only the checks
# that say the toolbar OFFERS something can tell, and they read the control with
# `checkVisibility({ opacityProperty: true })` before and after the hover.
#
# Before they did, this build passed 73/73 (lane 5, 29 September).
#
# Reddens: chat-message-actions: "the message toolbar has a ⋯ overflow" and
#   "the toolbar offers 👍" and "the toolbar offers ✅" and
#   "the toolbar offers 🔥" and "the toolbar offers Save"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = 'className="absolute right-3 -top-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150"'
b = 'className="absolute right-3 -top-3 opacity-0 transition-opacity duration-150"'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-chat-page.tsx: the message hover toolbar never shows.')
