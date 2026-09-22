# A reaction floats over your own tiles and is never sent to anybody else.
#
# THE FACADE, and the suite's own comment names the trap before the patch
# exists: the reaction is rendered locally ON PURPOSE, because "waiting for the
# round trip to see your own reaction makes the button feel broken". So the
# sender's screen is the one place that proves nothing at all, and it is the
# only place a one-browser check can look.
#
# Removing the emit leaves a control that is instant, animated and completely
# convincing to the person pressing it. The listener stays wired, so the
# component still handles incoming reactions and the file reads as a working
# two-way feature. Nobody else ever sees one.
#
# Two checks and only the second can tell: "A sees their own reaction" still
# PASSES, correctly, because the local render is deliberate and unchanged. It
# takes a second browser on the same call to notice — which is what this whole
# suite exists for, and why an HTTP check and a unit test both agree the
# feature works.
#
# Reddens: syncup-live: "and it reaches the other person in the call"
import io
p = '/home/user/rundesk/apps/web/src/components/call/call-surface.tsx'
a = """  const sendReaction = (emoji: string) => {
    getRealtimeSocket().emit('call.reaction', {
      callId: call.id,
      workspaceId: call.workspaceId,
      emoji,
    })
    // Shown locally too: waiting for the round trip to see your own reaction
"""
b = """  const sendReaction = (emoji: string) => {
    // Shown locally: waiting for the round trip to see your own reaction
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('call-surface.tsx: a reaction is drawn locally and sent nowhere.')
