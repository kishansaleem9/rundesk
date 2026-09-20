# The gate treated as a boolean instead of a ladder: only "View only" refuses,
# and "Comment" — the rung the wizard offers between view and edit — silently
# means edit. A check written as `=== 'view'` passes every one-sided test.
# Reddens: space-default-permission:
#   "`comment` — the rung between — is refused as well, so the gate is a ladder"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = """  if (spaceLevelReaches(resolved.level, params.required)) return
"""
b = """  if (resolved.level === 'comment') return
  if (spaceLevelReaches(resolved.level, params.required)) return
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("space-default-permission.ts: 'comment' now clears the gate, so only the bottom rung refuses anything.")
