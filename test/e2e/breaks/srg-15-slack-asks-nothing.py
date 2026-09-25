# SLACK'S CONNECT ASKS FOR NOTHING: any member connects it.
# Reddens: settings-role-grants: "Slack is connected by the holder of integrations.manage, as the catalog files it — a plain member is refused (403, none made)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/slack/slack.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @UseGuards(PermissionsGuard)\n  @RequirePermissions('integrations.manage')\n  @ApiOperation({ summary: 'Connect or update Slack integration (needs integrations.manage)' })\n"
b = "  @ApiOperation({ summary: 'Connect or update Slack integration (needs integrations.manage)' })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-15-slack-asks-nothing: Slack asks nothing')
