# A PULL LOOKS ITS EVENTS' LINKS UP IN EVERY WORKSPACE, as it did: a link elsewhere with the same event id is overwritten.
# Reddens: unit: calendar-sync.service.test.ts "looks each event's link up among the pulling workspace's links only"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
a = "            eq(taskCalendarLinks.workspaceId, workspaceId),\n            eq(taskCalendarLinks.provider, provider),\n            eq(taskCalendarLinks.externalEventId, event.id),\n"
b = "            eq(taskCalendarLinks.provider, provider),\n            eq(taskCalendarLinks.externalEventId, event.id),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpa-5-links-in-any-workspace-unit: the link lookup asks no workspace')
