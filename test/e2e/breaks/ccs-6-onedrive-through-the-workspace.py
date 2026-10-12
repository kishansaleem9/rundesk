# THE WORKSPACE’S SHAREPOINT ANSWERS WITH THE CONNECTOR’S ONEDRIVE.
# (`found-23-sep/connected-search-per-person`)
# Reddens: connected-search: "through the workspace’s SharePoint a member finds the organization’s sites, not the connector’s own OneDrive"
#
# SharePoint hits are not narrowed to the organization’s sites.
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        .filter((r) => cred.heldBy !== 'workspace' || !isPersonalOneDrive(r.webUrl as string))\n",
     '        // BROKEN: OneDrive too\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccs-6-onedrive-through-the-workspace: THE WORKSPACE’S SHAREPOINT ANSWERS WITH THE CONNECTOR’S ONEDRIVE.')
