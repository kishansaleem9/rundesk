# The pill shows time ELAPSED instead of time remaining, so the number moves
# every second and moves the wrong way. A check that only asserts "the text
# changed" passes on this; the frames count 2h 56m down to 2h 55m.
# Reddens: focus-pill: "and counts DOWN"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-focus-tab-title.ts'
a = """            remaining: formatRemaining(new Date(block.endsAt).getTime() - now),
"""
b = """            remaining: formatRemaining(now - new Date(block.startsAt).getTime()),
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('use-focus-tab-title.ts: the pill counts elapsed time upward instead of counting the block down.')
