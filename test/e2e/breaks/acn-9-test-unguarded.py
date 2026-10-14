# ANY MEMBER MAY TEST A RULE.
# (`found-14-oct/automation-conditions-and-actions-unbuilt`)
# Reddens: automation-conditions: "testing the rule on the untagged task says it would not act and which condition fails — no comment, no run logged; a member who may not manage automations is refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/automations/automations.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  @Post(':automationId/test')\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('automation.manage')\n",
     "  @Post(':automationId/test')\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acn-9-test-unguarded: ANY MEMBER MAY TEST A RULE.')
