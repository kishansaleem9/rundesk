# THE DIALOG ASKS ANOTHER KEY: the member who manages integrations is offered no Sync now.
# Reddens: calendar-pull-access: "the Calendar sync dialog shows the member the connected calendar without offering them Sync now — and offers it to the member who manages integrations"
import io
p = '/home/user/rundesk/apps/web/src/components/calendar-sync-wizard.tsx'
a = "  const mayPull = usePermissions(workspaceId).can('integrations.manage') === true\n"
b = "  const mayPull = usePermissions(workspaceId).can('webhook.manage') === true\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpa-4-sync-now-asks-another-key: the dialog asks webhook.manage')
