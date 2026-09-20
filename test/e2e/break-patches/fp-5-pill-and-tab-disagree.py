# The pill's clock shifted a minute ahead of the tab title's. One fact, two
# answers: the header reads "2h 55m left" while the tab reads "2h 56m left",
# and neither can be trusted because they cannot both be right.
# Reddens: focus-pill: "and the tab carries the pill's own remainder verbatim"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-focus-tab-title.ts'
a = """    const paint = () => {
      const now = Date.now()
      const today = startOfDayIso(new Date(now))
"""
b = """    const paint = () => {
      const now = Date.now() + 60_000
      const today = startOfDayIso(new Date(now))
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("use-focus-tab-title.ts: the pill reads the clock a minute ahead of the tab title's.")
