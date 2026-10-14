# TRACKED TIME TURNED OFF IS READ AND MADE ANYWAY.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "asked for them, the Workspace’s own Docs come in beside the workspace’s other Docs; time and Goals turned off are neither read nor made"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    const time = options.time === 'no' ? new Map<string, ImTime[]>() : await this.timeOf(source, project.id, people, members, errors)\n",
     '    const time = await this.timeOf(source, project.id, people, members, errors)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-24-time-off-still-read: TRACKED TIME TURNED OFF IS READ AND MADE ANYWAY.')
