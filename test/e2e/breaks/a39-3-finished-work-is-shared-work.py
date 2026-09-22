# The Tasks tab stops excluding closed work.
#
# The line's own comment is the specification: "Still open — the tab answers
# 'what are we both on?', and everything we ever finished together is a
# different, much longer question."
#
# Much longer is the point. Two colleagues of a year have hundreds of finished
# tasks between them and a handful of live ones, so the tab inverts: the answer
# to "what are we both on" arrives buried under everything you have both ever
# done, and the `limit(100)` means the live tasks may not be in the response at
# all. The heading still reads "Open tasks with …", which is the part that makes
# it a lie rather than a long list.
#
# `ne(tasks.statusCategory, 'closed')` sits between `eq(tasks.isArchived,
# false)` and an `inArray` in the same `and(…)` — a list of filters where each
# looks like a variation on the last, which is the shape `undo-delete-4` and
# `list-statuses-seeded-4` were both about.
#
# ONE CHECK. The shared task is still listed, the solo meeting is still absent,
# the heading is still right, the stream is still hidden. Only "a closed task is
# not listed under 'open tasks'" fails — and it is asserted as an ABSENCE,
# which is the only shape that could catch this.
#
# Reddens: a39-dm-tabs: "a closed task is not listed under \"open tasks\""
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = """          // Still open — the tab answers "what are we both on?", and everything
          // we ever finished together is a different, much longer question.
          ne(tasks.statusCategory, 'closed'),
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('meetings.service.ts: the DM Tasks tab now lists finished work too.')
