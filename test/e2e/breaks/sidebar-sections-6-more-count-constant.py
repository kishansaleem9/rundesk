# The "More" row reports a constant instead of the real hidden count, so it
# cannot tell you whether it is holding one conversation back or forty.
# Every other AI-chats check still passes.
# Reddens: sidebar-sections: "a "More" that does not know how many cannot tell you whether it is holding one "
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '          data-hidden={hidden}'
b = '          data-hidden={1}'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the More row claims one hidden conversation whatever the truth is.')
