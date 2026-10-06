# A DELIVERY INTO A LIST IN THE TRASH IS REFUSED AS IF THE HOOK’S MAKER HAD LOST THE LIST, as it was.
# Reddens: unit: inbound-webhooks.service.test.ts "answers a list in the trash in the trash’s own words (409), and makes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = '      if (err instanceof ListInTrashException) throw err\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('iws-1-the-trash-said-as-the-makers-unit: the trash is said as the maker’s refusal')
