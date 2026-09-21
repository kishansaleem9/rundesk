# `data-count` becomes a constant. The section still draws the right rows, so
# only the check that compares the section's own claim with what it drew can see
# it — and a count nothing can contradict is the facade in miniature.
# Reddens: sidebar-dms "and the section's own count agrees with what it drew"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "    <div className=\"pt-1\" data-testid=\"sidebar-direct-messages\" data-count={dms.length}>\n"
b = "    /* BROKEN: a count that can only ever say one thing. */\n    <div className=\"pt-1\" data-testid=\"sidebar-direct-messages\" data-count={1}>\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the DM section always claims one conversation.')
