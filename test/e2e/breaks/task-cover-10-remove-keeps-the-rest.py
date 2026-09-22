# Remove clears the colour and leaves the stored file and the link behind. The
# banner goes, because a colour is what was drawn — and the row still carries
# two other covers for the next thing that reads it: a template, an export, or
# a board card.
#
# PREDICTED ONE.
#
# Reddens: task-cover: "pressing Remove clears the colour, the stored file and the link together"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                : { coverColor: null, coverStorageKey: null, coverImageUrl: null },"
b = "                : { coverColor: null },"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: Remove clears the colour only.')
