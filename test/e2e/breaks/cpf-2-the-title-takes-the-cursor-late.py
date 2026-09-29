# THE TASK TITLE TAKES THE CURSOR A MOMENT AFTER THE CREATOR IS DRAWN, AND WHAT IS TYPED IN THAT MOMENT IS LOST.
#
# `autoFocus` becomes a focus sent after the title has mounted — the shape of
# opening the creator first and sending the cursor after it, which is what
# `found-29-sep/comment-plus-menu-keeps-focus-after-create` chose not to do.
# The cursor does arrive, so a check that waits for it passes; the name typed
# the moment New Task has opened the creator goes nowhere. This is why the
# suite types before it reads the cursor.
#
# Reddens: comment-plus-menu: "and a name typed straight after lands in the title, every character of it"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = """      <Input
        autoFocus
        ref={titleRef}
        data-testid="quick-create-task-title"
"""
b = """      <Input
        ref={(el) => {
          titleRef.current = el
          if (el) setTimeout(() => el.focus(), 1500)
        }}
        data-testid="quick-create-task-title"
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the task title takes the cursor 1.5s after it is drawn.')
