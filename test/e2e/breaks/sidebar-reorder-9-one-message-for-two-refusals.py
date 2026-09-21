# The "you left a sibling out" refusal reuses the "that id is not in this
# container" sentence. Both are 400, so a check that only reads the status cannot
# tell a mis-addressed container from a stale tree — the trap about two
# mechanisms sharing one status code, made real.
# Reddens: sidebar-reorder "and a partial order is refused with a DIFFERENT sentence, not the same 400"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = """        `orderedIds must list every ${kind} in this ${containerKind} exactly once ` +
          `(got ${orderedIds.length}, ${siblings.length} expected)`,
"""
b = """        // BROKEN: one sentence for two different mistakes.
        `These ids are not ${kind}s of ${containerKind} ${containerId}: `,
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspaces.service.ts: both 400s now say the same thing.')
