# The dock's hang-up button stops calling `onLeave`.
#
# It is the path this whole item creates, and the suite says so: "hanging up
# works from where you ended up — straight off the dock, without going back to
# chat. That is the path this whole change creates: before it, you could only
# leave from the full surface, because navigating away had already left for
# you."
#
# Under this patch the dock survives the navigation exactly as it should, and
# the one thing you can do from it does nothing. The tile stays in everybody
# else's call for as long as the tab is open, and the person pressing the red
# button believes they have gone.
#
# `onLeave` is passed in as a prop and used in two places — the full surface's
# control and this one — and the dock's own comment explains that it is named
# separately BECAUSE it is its own path. A patch that cut the surface's button
# instead would be caught by nothing here, which is why that comment is there.
#
# ONE CHECK, THE LAST BUT ONE. Everything about surviving the navigation stays
# green, including both server checks, because the call really is still running
# — that is what makes this the leave check rather than a second copy of the
# survival check.
#
# Reddens: call-survives-navigation: "and hanging up from another page actually leaves"
import io
p = '/home/user/rundesk/apps/web/src/components/call/call-surface.tsx'
a = """            <button
              onClick={onLeave}
              title={t('call.leave')}
              data-testid="call-dock-leave"
"""
b = """            <button
              onClick={() => {}}
              title={t('call.leave')}
              data-testid="call-dock-leave"
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('call-surface.tsx: the dock\'s hang-up button no longer leaves the call.')
