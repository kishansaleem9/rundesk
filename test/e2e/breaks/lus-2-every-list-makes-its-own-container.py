# The space container is created fresh every time instead of being reused.
#
# `if (existing) return existing.id` goes, so the first thing
# `ensureSpaceContainer` does is insert. A space with ten space-level lists
# ends up with ten hidden projects, each holding one list — and because the
# insert carries `onConflictDoNothing`, the second call may return nothing and
# fall through to the re-select, which finds whichever one the unique index let
# through. Which container a list lands in becomes a matter of timing.
#
# The damage is invisible until it is not. Every list still works; the tree
# still shows them under the space, because the tree reads them through the
# container rather than beside it. What breaks is the list-name uniqueness
# constraint, which is scoped per PROJECT: two lists called "Backlog" in one
# space stop clashing, because they are in different hidden containers, and
# §V2-S11's "List name taken" quietly stops applying to space-level lists.
#
# ONE CHECK, and it is the one the suite wrote for it. The rest pass because
# nothing about a single list changes.
#
# Reddens: list-under-space: "a second one reuses the same container rather than making another"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = "    if (existing) return existing.id\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lists.service.ts: a new hidden container is made for every space-level list.')
