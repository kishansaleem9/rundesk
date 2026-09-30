# `uq_projects_default_container_per_space` leaves the schema, so a database
# built by `drizzle-kit push` has no such index: the state every lane and CI
# were in until 30 September, when only migration 0129 made it
# (`found-30-sep/comment-file-index-only-in-a-migration`).
#
# `defaultContainerForSpace` is written against the index: it looks for the
# space's container, inserts one with ON CONFLICT DO NOTHING when there is
# none, and reads the winner back when its insert lost. Without the index
# nothing conflicts, so the first lists of a space made at once each make a
# container, and the space's listing reads one of them. Measured on lane 5 with
# the index dropped: six lists made at once made six containers, and the space
# listed one of the six.
#
# The break runner pushes a patched schema to the lane, which drops the index.
#
# Reddens: list-under-space: "six lists made at once in a new space share one container, and the space lists all six"
import io
p = '/home/user/rundesk/packages/db/src/schema/projects.ts'
a = "  uniqueIndex('uq_projects_default_container_per_space').on(t.spaceId).where(sql`${t.isDefaultContainer}`),\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('projects.ts: the one-container-per-space index is declared nowhere a push reads.')
