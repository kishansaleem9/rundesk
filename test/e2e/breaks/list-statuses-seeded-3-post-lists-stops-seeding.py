# `ListsService.create` stops seeding — the ONE path that always did.
#
# The check this reddens exists for exactly this: "The path that was always
# correct, asserted so a future 'simplification' cannot quietly take the
# seeding out of `ListsService.create` too." Six other creation paths were
# brought up to this one's behaviour; nothing was watching the original.
#
# The simplification is easy to imagine. `seedListStatuses` is
# `onConflictDoNothing`, the starter list already has statuses, and a reader
# skimming for redundant work sees a seed call in seven places and removes the
# one that looks like a duplicate of the backfill.
#
# EXACTLY ONE CHECK. The starter list — which this suite is really about — is
# seeded by `WorkspacesService` and is untouched, so everything above stays
# green and the failure names the path that broke rather than the feature.
#
# Reddens: list-statuses-seeded: "a list made through POST /lists gets the same pipeline as the starter one"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = "    await seedListStatuses(this.db, list.id)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lists.service.ts: POST /lists no longer gives a new list its status pipeline.')
