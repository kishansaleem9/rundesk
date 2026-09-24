# A SETTINGS SAVE SPREADS ITS BODY INTO THE ROW AGAIN: the plan, its limits and the domain's verification are the caller's.
# Reddens: settings-writes: "a workspace admin’s save renames the workspace and changes neither its plan, its limits, nor its domain’s verification or token"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = "    const set: Record<string, unknown> = { updatedAt: new Date() }\n    for (const key of ['name', 'logoUrl', 'primaryColor', 'accentColor'] as const) {\n      if (patch[key] !== undefined) set[key] = patch[key]\n    }\n"
b = '    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("stw-1-the-save-spreads-its-body: applied")
