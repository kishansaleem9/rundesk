# The anti-facade check for the Link tab, the same shape as
# `task-cover-2-customfacade` one section above: the box takes an address, the
# button presses, the dialog closes and the task gets a cover — always the same
# cover. Every "the cover changed" assertion passes on this.
#
# PREDICTED ONE. The refusal still refuses (the guard is untouched) and the
# colour is still cleared, so only the byte-for-byte read moves.
#
# Reddens: task-cover: "an http address becomes the task's cover, byte for byte"
import io
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
a = "    commit({ kind: 'link', url: value })\n"
b = "    commit({ kind: 'link', url: 'https://example.com/constant-cover.png' })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cover-image-picker.tsx: every link commits one constant cover.')
