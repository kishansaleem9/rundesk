# A link cover is set WITHOUT clearing the colour one, so the task carries two
# covers at once. One of them is drawn and the other is a surprise the next time
# something reads the row — a template, an export, or the card in a board.
#
# The PATCH body simply stops sending `coverColor: null`, which is the shape this
# would really take: three fields listed instead of four.
#
# PREDICTED ONE. The address still lands byte for byte, so only the check about
# replacing moves.
#
# Reddens: task-cover: "and it replaces the colour rather than sitting behind it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                ? { coverColor: null, coverStorageKey: null, coverImageUrl: choice.url, coverOffsetY: 50 }"
b = "                ? { coverStorageKey: null, coverImageUrl: choice.url, coverOffsetY: 50 }"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: a link cover leaves the colour cover in place.')
