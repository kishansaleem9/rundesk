# GOALS TURNED OFF ARE READ AND MADE ANYWAY.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "asked for them, the Workspace’s own Docs come in beside the workspace’s other Docs; time and Goals turned off are neither read nor made"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (options.goals !== 'no') {\n",
     "    if (options.goals !== 'never') {\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-25-goals-off-still-made: GOALS TURNED OFF ARE READ AND MADE ANYWAY.')
