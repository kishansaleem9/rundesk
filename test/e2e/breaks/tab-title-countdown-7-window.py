# Check 2 — the render is right for the wrong reason, or not at all.
#
# Ask the server for TOMORROW onwards. The request still goes out, still has
# `from` and `to`, still returns 200 with a perfectly good list of blocks — it
# just cannot contain the one that is running, because the window starts after
# now. This is the shape of bug that "the title looked right on my machine"
# hides: on a day with a block tomorrow it even renders something.
#
# Check 2 is the one that names it ("it asked for a window that contains right
# now"); 3–8 fall over behind it, because there is nothing to count down.
import io
p = '/home/user/rundesk/apps/web/src/lib/use-focus-tab-title.ts'
s = io.open(p, encoding='utf-8').read()
a = "      from: new Date(anchor - DAY_MS).toISOString(),\n"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    # BROKEN: the window starts tomorrow
    s.replace(a, "      from: new Date(anchor + DAY_MS).toISOString(),\n")
)
print('BROKE check 2: the blocks request asks for a window that cannot contain now')
