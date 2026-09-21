# The pill keeps the last block it saw once nothing is running. The countdown
# outlives its block, sits in the header reading a number that stopped being
# true, and nothing on screen says so. This is the half of the bug a reload
# hides, which is why the suite lets the block end with the page still open.
# Reddens: focus-pill:
#   "when the block ends the pill disappears, with no reload to hide behind"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-focus-tab-title.ts'
a = """      setRunning((prev) => {
        if (prev === next) return prev
        if (prev && next && prev.label === next.label && prev.remaining === next.remaining) return prev
        return next
      })
"""
b = """      setRunning((prev) => {
        if (!next) return prev
        if (prev === next) return prev
        if (prev && next && prev.label === next.label && prev.remaining === next.remaining) return prev
        return next
      })
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('use-focus-tab-title.ts: the pill never clears — the last countdown it saw stays in the header forever.')
