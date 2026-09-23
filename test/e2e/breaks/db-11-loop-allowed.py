# THE DESCENDANT WALK REMOVED: a doc moved inside its own child — a loop.
# Reddens: doc-boundaries: "nor moved inside its own child — a loop no tree walk leaves"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = '    if (!movingDocId) return\n'
# ALWAYS TRUE AT RUNTIME, NOT PROVABLY TRUE TO THE COMPILER. An unconditional
# throw or return makes the code below it unreachable, TypeScript drops every
# narrowing there, and the build refused this patch — so it ran as BUILD
# FAILED and proved nothing. The condition is a value that is always set here.
b = '    if (parentDocId) return\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-11-loop-allowed: applied")
