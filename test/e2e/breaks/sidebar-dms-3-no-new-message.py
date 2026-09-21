# The section lists conversations and offers no way to start one. That is the
# dead half of the feature: `+ New message` is the gesture `+ Add Channel`
# cannot make, and it is the reason DMs are a second section at all.
# Reddens: sidebar-dms "with a \"+ New message\" row of its own"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "      {picking ? (\n"
b = "      {/* BROKEN: no way to start a conversation. */}\n      {true ? null : picking ? (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: "+ New message" is gone.')
