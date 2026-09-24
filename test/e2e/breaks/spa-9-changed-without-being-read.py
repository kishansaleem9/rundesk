# A RENAME AND A DELETE ASK NOTHING OF WHO MAY READ THE SPRINT: a private space's is renamed by id.
# Reddens: sprint-access: "a member neither renames nor deletes a private space’s sprint, nor renames a view-only space’s, and a guest, given no sprint, renames none — a member renames the open one"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.service.ts'
a = '    await this.assertMayChange(await this.readable(sprintId, actor), actor)\n    const set: Record<string, unknown> = { ...patch }\n'
b = '    await this.assertMayChange(await this.get(sprintId), actor)\n    const set: Record<string, unknown> = { ...patch }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("spa-9-changed-without-being-read: applied")
