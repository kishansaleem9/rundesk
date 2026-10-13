# BASECAMP'S WAY BACK TAKES A STATE THIS SERVER DID NOT SIGN (security): anyone can
# write one naming any person here, and the grant is kept for them.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "a way back whose state this server did not sign is refused though its code is good, and keeps nothing; a member without the Import data permission is not offered Basecamp at all"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/basecamp-import/basecamp-import.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (got.length !== want.length || !timingSafeEqual(got, want)) return null\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-12-an-unsigned-state-taken: the state is read without its signature')
