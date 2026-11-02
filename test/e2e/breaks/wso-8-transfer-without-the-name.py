# TRANSFER OWNERSHIP'S BUTTON IS ON ONCE A MEMBER IS PICKED, before the name is typed.
# Reddens: workspace-ownership: "Transfer ownership offers the members who may own it, stays off until one is picked and the name typed exactly, and hands it over: the admin owns it, the previous owner stays an admin, and it is recorded"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-ownership-dialogs.tsx'
a = '            disabled={!picked || typed !== workspace.name || transfer.isPending}\n'
b = '            disabled={!picked || transfer.isPending}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-8-transfer-without-the-name: applied")
