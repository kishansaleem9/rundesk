# The thread-history seed goes back to REPLACING `messages` instead of merging
# over what the mount produced — the state the AI panel was in when a turn that
# finished while the history request was still in flight disappeared off the
# screen.
#
# WRITTEN BECAUSE THE FIX HAD NO PATCH AIMED AT IT. `ai-answer-rendering` had
# never once run to its declared length: the check below failed, the
# `innerText()` after it spent thirty seconds on an element that was not there,
# and the run ended at 35 of 51 with sixteen checks unreported. Two things were
# changed to make it green — the unqualified read was bounded, and this effect
# stopped replacing a turn it had not seen — and a green baseline does not say
# which of the two mattered. A product fix with no patch aimed at it is a fix
# nobody can show is load-bearing, so here is the patch.
#
# Restoring the wholesale replace is maximally plausible: it is what the code
# said for months, under a comment explaining that the `loadedThreadRef` guard
# stops a REFETCH wiping a streaming turn. The guard is real and the comment is
# true; what neither covers is the ONE seed it does allow, which lands after a
# turn that has already finished and takes the answer with it.
#
# PREDICTED ONE, and the count is the interesting part. If this reddens the
# trace check, the merge is what made the suite green and the bounded read only
# stopped the crash. If it stays green, the bounded read was the whole of it and
# this patch says so — which is worth knowing either way, and is why the header
# is written before the run rather than after.
#
# Reddens: ai-answer-rendering: "when the tool step arrives the step log names
#   it — not a generic \"Working\""
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """    setMessages((prev) => {
      const known = new Set(history.map((m) => m.id))
      return [...history, ...prev.filter((m) => !known.has(m.id))]
    })
"""
b = """    setMessages(history)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the history seed replaces the turn the mount produced.')
