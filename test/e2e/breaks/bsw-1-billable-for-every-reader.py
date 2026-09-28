# THE BILLABLE SWITCH IS LIVE FOR EVERY READER AGAIN: the member presses it, the API refuses, it flips back.
# Reddens: client-access: "the Billable by default switch is live for the manager, who may change the project, and disabled for the plain member, who may not"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const billableLocked = canEdit !== true || projectQuery.isLoading || toggle.isPending\n"
b = "  const billableLocked = projectQuery.isLoading || toggle.isPending\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bsw-1-billable-for-every-reader: the switch ignores the edit rule')
