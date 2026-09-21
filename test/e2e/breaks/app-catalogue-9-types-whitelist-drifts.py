# The federated types go back to being written out by hand, with `drive` in and
# the other two missing. The controller then DROPS `types=gmail`, never assigns
# `filters.types`, and runs an unfiltered Rundesk search whose tasks and docs
# are presented as the contents of a mailbox.
# Reddens: app-catalogue: "and scoping it to Gmail returns nothing rather than
#          everything"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/entity-types.ts'
a = "  ...(Object.values(FEDERATED_ENTITY_TYPES) as SearchEntityType[]),\n"
b = "  'drive' as SearchEntityType,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('entity-types.ts: the ?types= whitelist knows drive and not gmail/sharepoint.')
