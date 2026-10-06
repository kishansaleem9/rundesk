# LOADING SAMPLE DATA ASKS NO GUEST RULE (`found-6-oct/a-guest-who-may-import-makes-a-space`): a guest granted workspace.import by a custom role
# seeds an empty workspace with three public spaces made by nobody.
# Reddens: data-transfer-keys: "a guest granted workspace.import by a custom role is refused the sample data, 403 “Guests cannot import data into a workspace”, and the workspace stays empty"
import io
p = '/home/user/rundesk/apps/api/src/modules/sample-data/sample-data.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    await assertMayImport(this.db, { workspaceId, actorId: actor.id })\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dtk-11-a-guest-seeds-sample-data: the seed skips the guest rule')
