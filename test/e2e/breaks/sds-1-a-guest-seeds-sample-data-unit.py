# LOADING SAMPLE DATA ASKS NO GUEST RULE (`found-6-oct/a-guest-who-may-import-makes-a-space`).
# Reddens: unit: sample-data.service.test.ts "a guest is refused 403 “Guests cannot import data into a workspace”, whatever a custom role grants them, before anything else is read or written"
import io
p = '/home/user/rundesk/apps/api/src/modules/sample-data/sample-data.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    await assertMayImport(this.db, { workspaceId, actorId: actor.id })\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sds-1-a-guest-seeds-sample-data-unit: the seed skips the guest rule')
