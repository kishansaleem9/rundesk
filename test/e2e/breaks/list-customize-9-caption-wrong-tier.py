# THE ANTI-DRIFT PATCH. The caption resolves its tier from the plan catalog
# by a DIFFERENT rule than `feature-gate.tsx`'s `upgradeTarget`, so the
# label says Pro while the dialog behind it offers Business.
# Reddens: "it names Business", "the caption names the same tier the gate offers".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    const tier = plan?.catalog?.find((row) => row.features?.boardExport === true)'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '    const tier = plan?.catalog?.find((row) => row.features?.ai === true)'))
print('[break 9] The caption names a cheaper tier than the one that unlocks it.')
