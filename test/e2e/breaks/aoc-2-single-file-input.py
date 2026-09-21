# NOTE: this duplicates the pre-existing `aoc-1-single-file.py` exactly (same anchor,
# same replacement). It was written before that file was noticed and its result is
# recorded in break-attach-on-create.txt under this name; either one can be dropped.
# The paperclip goes back to one file at a time: `multiple` comes off the input,
# so picking a second file REPLACES the first with nothing on screen to say a
# file was dropped — the create surface that silently discards a chosen file.
# Reddens: attach-on-create: "the file input accepts several files at once, behind a paperclip a person can press"
import io

p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '            type="file"\n            multiple\n'
b = '            type="file"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the attach input takes one file again.')
