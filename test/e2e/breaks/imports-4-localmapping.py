# Check 4 — the mapping edit updates local state and never tells the server.
# Identical on screen; the column is imported anyway.
#
# Reddens: imports: "changing a column sends the new mapping to the server"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-import-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    previewMut.mutate({ mapping: next })'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '    previewMut.mutate({ mapping: mapping ?? undefined })'))
print('BROKE check 4: a column change no longer reaches the server')
