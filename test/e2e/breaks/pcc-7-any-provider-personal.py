# ANY PROVIDER CAN BE CONNECTED "FOR ONESELF", not only a calendar.
# Reddens: unit: integration-connections.personal.test.ts "is a calendar or nothing: no other provider is connected by one person for themselves"
#
# Re-aimed 12 October: a search source is connected for oneself too now
# (ClickUp's personal Connected Search), so the refusal names three kinds. Same break.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (opts.personal && provider !== 'gcal' && provider !== 'outlook' && !PERSONAL_SEARCH_PROVIDERS.has(provider)) {\n"
b = "    if (opts.personal && workspaceId === '') {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pcc-7-any-provider-personal: any provider is personal')
