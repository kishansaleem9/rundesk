# The tab strip goes back to its own hand-kept copy of the list — the
# duplicated-list defect, reintroduced, and already drifted by one entry.
#
# REWRITTEN 21 September. The old anchor was `{CREATE_TYPES.map((tab) => (`,
# and the strip has not mapped `CREATE_TYPES` directly since the search filter
# landed: it maps `shownTypes`, a memo that returns `CREATE_TYPES` unfiltered
# when the query is empty and a subset otherwise. The patch was aimed at a line
# that had moved, so `wt-break.sh` refused it and the check it names has had no
# baseline since.
#
# The defect being modelled is unchanged and is if anything easier to state
# now: the strip stops reading the shared list and keeps its own. Eight entries
# where `CREATE_TYPES` has nine — Form, the one this row added, is the one that
# goes missing, which is exactly how a hand-kept copy drifts.
#
# Reddens: space-create-menu: the strip offers every kind in CREATE_TYPES
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '          {shownTypes.map((tab) => (\n'
b = (
    "          {shownTypes\n"
    "            .filter((tb) => ['task', 'doc', 'list', 'folder', 'space', 'project', 'whiteboard', 'dashboard'].includes(tb.value))\n"
    "            .map((tab) => (\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the tab strip keeps its own list of kinds, and it is already one short.')
