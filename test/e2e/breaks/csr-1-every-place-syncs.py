# A SYNC TAKES EVERY TASK OF THE WORKSPACE, WHEREVER IT IS: its place is not asked.
# (`ledger-rows/row-1962`)
# Re-aimed 8 October: `undefined && or(…)` is a compile error (TS2873, always falsy); an unset variable's ternary is not.
# Reddens: calendar-sync-rules: "a task in a place no sync holds is not written; moved out of the folder its event comes off, and moved back it is written again"
#   or "a sync of only the tasks assigned to its owner takes a task once they are assigned it, and gives it up when they are not"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        eq(calendarSyncRules.workspaceId, task.workspaceId),\n        or(\n',
     "        eq(calendarSyncRules.workspaceId, task.workspaceId),\n        process.env.CSR_NEVER === 'yes' ? or( // BROKEN: the place is not asked\n"),
    ("          and(eq(calendarSyncRules.scopeType, 'space'), eq(calendarSyncRules.scopeId, task.spaceId)),\n        ),\n      ))\n",
     "          and(eq(calendarSyncRules.scopeType, 'space'), eq(calendarSyncRules.scopeId, task.spaceId)),\n        ) : undefined,\n      ))\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-1-every-place-syncs: every place syncs')
