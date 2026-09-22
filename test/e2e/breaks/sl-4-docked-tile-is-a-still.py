# The minimised dock draws a placeholder instead of the live camera.
#
# The dock is right in every other respect: it appears in the corner, the
# full-screen surface goes away, the participant count is there, the mic and
# expand and leave buttons all work, and the call is genuinely still running
# behind it. Only the `<video>` loses the ref that attaches the stream, which
# reads like tidying — the same `attachLocal` callback is used by the full
# surface, and a second consumer of one ref is the kind of thing somebody
# "simplifies".
#
# The whole point of minimise is that the call KEEPS RUNNING while you go and
# look at something else, and the dock is how you can tell. A black rectangle in
# the corner is indistinguishable from a call that was torn down — which is the
# failure this suite's comment says a markup check could not see: "A minimise
# that tears the call down would look completely correct from the markup."
#
# One check, and it is the one that asks the video element whether it has
# painted a frame rather than whether it exists. `and the call is still running
# while minimised` reads the server and passes, correctly, which is exactly the
# pair that makes this readable: the call IS live and the dock is not showing
# it.
#
# Reddens: syncup-live: "and the docked tile is live rather than a black box"
import io
p = '/home/user/rundesk/apps/web/src/components/call/call-surface.tsx'
a = """        <div className="relative aspect-video bg-black">
          <video ref={attachLocal} autoPlay playsInline muted className="h-full w-full object-cover" />
"""
b = """        <div className="relative aspect-video bg-black">
          <video autoPlay playsInline muted className="h-full w-full object-cover" />
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('call-surface.tsx: the docked tile has no stream attached to it.')
