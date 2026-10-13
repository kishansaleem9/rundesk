# THE BASECAMP CLIENT ASKS ANY ADDRESS IT IS GIVEN (security): a Link header or a
# project's dock can send it, with the person's token, anywhere — the cloud's metadata
# address included.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: unit: basecamp-api.test.ts "refuses an address off Basecamp’s API origin before asking it, and says a revoked grant in words"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/basecamp-import/basecamp-api.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (u.origin !== this.origin) throw new BasecampError(BASECAMP_REFUSALS.elsewhere)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-u11-any-address-asked: no origin check')
