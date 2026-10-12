# EVERY MEMBER SEARCHES THE CONNECTOR'S DRIVE.
# Reddens: unit: search.service.test.ts "searches the workspace’s Drive for every member, asking Drive only for what the organization may see"
#
# Re-aimed 12 October: a workspace connection now answers every member, for what
# the whole organization may see (ClickUp's Workspace connection); the break is
# the workspace's grant answering as if it were each member's own — the
# connector's private files for everybody. The test it reddened was renamed with
# that rule. Same break.
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "    return { token: shared.token, heldBy: 'workspace' }\n"
b = "    return { token: shared.token, heldBy: 'you' }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fsr-2-drive-for-everyone: applied")
