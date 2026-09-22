# The span shortcuts stop ignoring form fields, so `d`, `x`, `w` and `m` fire
# while you are typing.
#
# The handler's comment says what that costs: "The Planner has a person search
# and a priority box on it; a bare `d` that jumped the calendar to Day view
# mid-word would make both unusable."
#
# Unusable is the right word, and it is stronger than "annoying", because the
# handler calls `preventDefault`. The keystroke is not merely acted on
# elsewhere — it is EATEN. Typing "week ahead" into the priority box produces
# "eek ahea" and a calendar that has jumped twice. There is no way to enter a
# word containing d, x, w or m.
#
# THE CHECK THAT CATCHES IT IS ON THE INPUT'S VALUE, AND THE SUITE RECORDS WHY
# IT HAD TO BE. Two earlier versions read the column count and both passed
# against this patch: the first ran before React re-rendered, and the second
# gave it time and still passed, because "week ahead" contains both `w` and
# `d` and `d` comes last — so the span bounced to Week and back to Day and
# ended where it started. "My own fixture defeated my own check." The
# characters that never arrived cannot be fooled that way.
#
# REDDENS ONE. The span check after it is the one that was fooled before, and
# it passes here for the same reason it did then — which is worth leaving in
# place, because a build where the shortcut fires AND the span sticks is a
# different bug and that check is what would say so.
#
# NOT CAUGHT BY THE UNIT TEST — 10 pass / 0 fail. `PLANNER_VIEW_KEYS` is a map
# from letters to spans and is correct; the guard that decides WHEN to consult
# it is a `keydown` listener in the page. A browser is the only place this
# exists.
#
# Reddens: planner-views: "the shortcuts stay out of the way"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = """      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      const next = PLANNER_VIEW_KEYS[e.key.toLowerCase()]
"""
b = """      const next = PLANNER_VIEW_KEYS[e.key.toLowerCase()]
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the span shortcuts now fire inside text fields.')
