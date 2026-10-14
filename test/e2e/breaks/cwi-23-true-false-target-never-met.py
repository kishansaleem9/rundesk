# A TRUE/FALSE TARGET THAT IS DONE COMES IN NOT MET.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "the Workspace’s Goal comes in with its Targets: Ana owns it, 70% along as its Targets are, due when it was; four deals of ten, and the site launched"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (k.type === 'boolean') return { name, unit: null, target: 1, current: done ? 1 : 0, done, owner }\n",
     "  if (k.type === 'boolean') return { name, unit: null, target: 1, current: 0, done, owner }\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-23-true-false-target-never-met: A TRUE/FALSE TARGET THAT IS DONE COMES IN NOT MET.')
