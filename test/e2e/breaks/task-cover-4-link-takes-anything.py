# The Link tab accepts whatever is in the box. `submitLink` stops asking
# whether the address is an address, so "mountains.jpg" is committed as a cover
# and the task draws a banner pointing at nothing — with no refusal on screen to
# say why, because there is nothing left to refuse.
#
# PREDICTED ONE. The two checks under it read the address that WAS committed and
# the colour it cleared, and both of those still hold: an http address still
# lands byte for byte, and it still replaces the colour. Only the refusal goes.
#
# Reddens: task-cover: "a bare filename is refused, in words, and nothing is written to the task"
import io
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
a = """    if (!/^https?:\\/\\//i.test(value)) {
      setLinkError(t('coverImage.linkMustBeHttp'))
      return
    }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('cover-image-picker.tsx: the Link tab commits whatever is typed, address or not.')
