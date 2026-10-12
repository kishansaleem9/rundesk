# THE WORKSPACE’S DRIVE ANSWERS WITH THE CONNECTOR’S PRIVATE FILES.
# (`found-23-sep/connected-search-per-person`)
# Reddens: connected-search: "through the workspace’s Drive a member finds what is shared with the whole organization and not the connector’s private file — Drive was asked for the shared ones alone"
#   or "and through the workspace’s Drive its connector finds the shared files too, not her own private ones"
#
# Drive is asked for everything the connected account sees, for every member.
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("${cred.heldBy === 'workspace' ? WORKSPACE_DRIVE_VISIBILITY : ''}",
     "${false ? WORKSPACE_DRIVE_VISIBILITY : ''}"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccs-3-the-workspace-drive-is-not-narrowed: THE WORKSPACE’S DRIVE ANSWERS WITH THE CONNECTOR’S PRIVATE FILES.')
