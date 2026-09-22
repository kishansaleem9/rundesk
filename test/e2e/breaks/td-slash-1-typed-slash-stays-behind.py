# The block is inserted at the caret and the "/" that opened the menu is left
# behind.
#
# Everything about the block is right: the table renders, it gets its own line,
# the caret lands inside it, the menu closes and the filter clears. The
# difference is four lines of arithmetic that find where the `/` started and
# replace FROM there rather than from the caret — and to a reader those four
# lines look like defensive index-juggling around a simple "insert at cursor".
#
# What the description then holds is `/Hello world` followed by a markdown
# table, and markdown does not know what a stray slash is, so it renders as
# part of the paragraph above. Every time anybody uses the feature the document
# collects one more of them.
#
# `[22:28]` is "main SLASH click karoongi, phir table bana loon" — the slash is
# the gesture, not content, and a gesture that leaves a mark is a gesture that
# has to be cleaned up by hand afterwards.
#
# PREDICTED ONE AND IT REDDENED TWO, and the second is the defect being worse
# than the header described. `picking Table writes a table` still passes,
# because the table is written — but `and renders as a real table, not a row of
# pipes` fails, because a stray `/` immediately before the table's first row
# keeps markdown from opening a table block at all. So the pipes render as
# literal pipes in a paragraph.
#
# That makes this blunter than "one leftover character": the block does not
# merely collect a slash, it stops being a block. Recorded rather than
# re-narrowed, because a patch whose damage is larger than predicted is still
# a patch aimed at the right line.
#
# Reddens: task-depth: "and the \"/\" that opened the menu is gone" and
#   "and renders as a real table, not a row of pipes"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """    const lineStart = text.lastIndexOf('\\n', caret - 1) + 1
    const before = text.slice(lineStart, caret)
    const slashAt = before.lastIndexOf('/')
    const from = slashAt === -1 ? caret : lineStart + slashAt
"""
b = """    const from = caret
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the block is inserted after the slash that opened the menu.')
