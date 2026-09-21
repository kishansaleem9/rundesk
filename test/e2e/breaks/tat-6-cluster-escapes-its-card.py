# THE RIGHT ID ON THE WRONG ROW. The cluster is positioned against the
# viewport instead of its card, so every card's actions land in one corner of
# the screen -- still visible, still wired, and no longer about the row they
# belong to.
# Reddens: task-attachments -- 'the cluster sits inside its own cards box'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md border border-border bg-card/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100\""""
b = """className="fixed right-1.5 top-1.5 flex items-center gap-0.5 rounded-md border border-border bg-card/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100\""""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the attachment action cluster is now positioned against the viewport.")
