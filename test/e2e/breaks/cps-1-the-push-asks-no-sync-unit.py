# A PUSH ASKS NONE OF THE SYNCS: a task is written to no calendar, whatever its syncs hold.
# Re-aimed 9 October: a push writes no connection of the workspace's any more, only a person's syncs (`ledger-rows/row-1962`); the break is a push that asks none of them, and it is named for that now.
# Reddens: unit: calendar-sync.service.test.ts "asks the syncs, and writes nothing into the workspace’s connections"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  async pushTask(taskId: string): Promise<SyncOutcome> {\n    return this.rules.syncTask(taskId)\n  }\n',
     '  async pushTask(taskId: string): Promise<SyncOutcome> {\n    void taskId // BROKEN: the syncs are not asked\n    return { written: [], unchanged: [], removed: [], skipped: [] }\n  }\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cps-1-the-push-asks-no-sync-unit: a push asks none of the syncs')
