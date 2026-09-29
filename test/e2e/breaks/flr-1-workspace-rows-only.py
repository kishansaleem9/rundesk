# A WORKSPACE READ LOADS THE WORKSPACE'S ROWS ALONE AGAIN: the platform's switch applies nowhere.
# Reddens: flag-resolution: "a platform switch turning Forms off reaches a workspace that says nothing of its own: the member is told it is off, and its routes answer 404"
import io
p = '/home/user/rundesk/apps/api/src/modules/feature-flags/feature-flags.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '        ? or(eq(featureFlags.workspaceId, ctx.workspaceId), isNull(featureFlags.workspaceId))\n'
b = '        ? or(eq(featureFlags.workspaceId, ctx.workspaceId), and(isNull(featureFlags.workspaceId), Boolean(0) ? undefined : eq(featureFlags.id, ctx.workspaceId)))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("flr-1-workspace-rows-only: the platform's rows are not read in a workspace")
