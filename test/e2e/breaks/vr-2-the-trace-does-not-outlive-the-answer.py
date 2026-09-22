# The trace renders while the answer is streaming and disappears when it lands.
#
# `AiTrace` is one component used twice — once for the live turn and once for
# the finished message, "so the two cannot drift into showing different things
# about the same turn". This patch makes exactly that drift: the finished call
# site stops rendering. So the list of what the assistant read is on screen for
# as long as it is reading and gone the moment there is something to check it
# against.
#
# It is the hardest kind of loss to notice by hand. A live trace looks like the
# feature working; you have to ask a question, wait, and then look — which is
# what the suite does and what a person demonstrating the feature would not.
#
# WRITTEN AS `live={false}` ON THE FINISHED CALL SITE, not as a deleted
# component, so the streaming trace is untouched and the failure is about
# survival rather than about traces existing at all. `{msg.role ===
# 'assistant' && <AiTrace … />}` and `{isStreaming && <AiTrace … />}` differ
# only by their guard, which is precisely why the component is shared and
# precisely what makes one of the two removable.
#
# REDDENS TWO, AND THEY ARE THE PAIR: the trace does not survive the answer,
# and the workspace step it should have contained is not there either. The
# answer still arrives, the follow-up chips still render and still send — so
# the failure names the trace rather than the turn.
#
# Reddens: video-regression: "and the trace of what it read stays with it"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """function AiTrace({ steps, t }: { steps: string[]; t: (k: TranslationKey) => string }) {
  if (steps.length === 0) return null
"""
b = """function AiTrace({ steps, t, live = true }: { steps: string[]; t: (k: TranslationKey) => string; live?: boolean }) {
  if (steps.length === 0 || !live) return null
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a2 = "            {msg.role === 'assistant' && <AiTrace steps={msg.steps ?? []} t={t} />}"
b2 = "            {msg.role === 'assistant' && <AiTrace steps={msg.steps ?? []} t={t} live={false} />}"
assert s.count(a2) == 1, f'second anchor appears {s.count(a2)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a2, b2))
print('ai-panel.tsx: the trace is live-only and does not survive the answer.')
