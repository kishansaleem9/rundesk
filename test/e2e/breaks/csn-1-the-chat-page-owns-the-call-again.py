# `CallHost` is mounted only while you are looking at the chat page, which is
# where it used to live.
#
# The defect as found, restored by its cause rather than by its symptom.
# `call-host.tsx` says what it was: "Everything here used to live in
# `ChannelCall`, which the chat page mounted. Clicking through to a task
# unmounted it and its cleanup hung up — so the picture-in-picture dock
# rendered, looked exactly right, and ended the call the moment you used it for
# the one thing it is for."
#
# Gated on the pathname rather than moved back into the chat page, because the
# behaviour under test is the LIFETIME of the component and a route-scoped mount
# has exactly the lifetime the old arrangement had. `pathname` is already in
# this file, read from the router, so the gate re-evaluates on every navigation
# — which is the whole point.
#
# IT STOPS THE RUN, AND WHAT IT STOPS ON IS THE DEFECT. The start button, the
# pre-join, the surface and the dock all work; the navigation happens; and then
# the dock is gone, the server has been told you left, and `call-dock-leave` is
# clicked on an element that no longer exists. Three checks fail in their own
# words before the timeout, and every one of them is a sentence about this bug.
#
# The unmount handover is not removed — it is still load-bearing, and the point
# of the fix was that it fires at the right boundary. This patch moves the
# boundary back.
#
# Reddens: call-survives-navigation: "and the call is still there after navigating away from chat"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.tsx'
a = "      <CallHost workspaceId={workspaceId} />"
b = "      {pathname.includes('/chat') && <CallHost workspaceId={workspaceId} />}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app.tsx: the live call is mounted only on the chat page again.')
