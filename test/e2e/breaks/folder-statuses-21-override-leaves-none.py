# Seed a list's own statuses only when it is NOT going to use them. A folder
# set to "Own statuses" then produces lists with an empty set, which refuses
# every status a task tries to take — the override that leaves you with
# nothing, and it looks like a working setting until somebody drags a card.
# Reddens: folder-dialog: "and a list in the other kind of folder has a usable set of its own"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = "    await seedListStatuses(this.db, list.id)"
b = "    if (scope === 'space') await seedListStatuses(this.db, list.id)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lists.service.ts: a list that owns its statuses is seeded with none.')
