# SENDING BACK ASKS NO KEY: a member without it sends the submitter’s approved week back.
# Reddens: time-approval-rule: "a member without the key sends nothing back (403, unchanged) — the member granted it does, and the reason is kept"
import io
p = '/home/user/rundesk/apps/api/src/modules/time-entries/time-entries.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('time.approval.manage')\n  rejectTimesheet("
b = '  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  rejectTimesheet('
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tar-5-sending-back-asks-nothing: rejecting asks nothing')
