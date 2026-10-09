# THE ASK AI DOCK OFFERS NO IMAGE TOOL.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "the Ask AI dock makes pictures too: opened by Brain² on a task, the one made is added to the task’s files, its very bytes"
#   or "and opened on no task, its Download saves the picture made — a PNG named after its description, its very bytes — and puts it on no task"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('            onClick={() => setImageOpen((open) => !open)}\n',
     '            onClick={() => setImageOpen((open) => open && !open)} // BROKEN: opens nothing\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-w6-the-dock-offers-no-image-tool: the dock offers no image tool')
