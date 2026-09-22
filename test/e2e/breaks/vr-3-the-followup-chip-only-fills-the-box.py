# A follow-up chip puts its suggestion in the composer instead of asking it.
#
# `sendMessage(suggestion)` becomes `setInput(suggestion)`. The chip is there,
# it is phrased as something you could say back, pressing it does something
# visible — the text appears in the box — and the question is not asked. So the
# feature reads as a template picker rather than as a follow-up, and one extra
# keystroke is required that nothing tells you about.
#
# WHY THE SUITE PRESSES THE CHIP AND COUNTS OCCURRENCES. It asserts the
# suggestion's text appears at least TWICE after the click: once as the chip and
# once as the message it sent. A check that the chip exists, or that it is
# clickable, or that the composer reacted, would all pass here — which is why
# the check is worded "and clicking one actually asks it" and measured that way.
#
# It is also the likeliest wrong wiring, because filling the box is what every
# other suggestion surface in this codebase does: the composer's own
# spelling-suggestion bar applies text to the input, and this chip sits a few
# hundred lines from it.
#
# ONE CHECK. The chips still render and are still phrased as questions, so the
# check above it passes; the answer, the trace and the workspace step are all
# untouched.
#
# Reddens: video-regression: "and clicking one actually asks it"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """                      disabled={isStreaming}
                      onClick={() => sendMessage(suggestion)}
"""
b = """                      disabled={isStreaming}
                      onClick={() => setInput(suggestion)}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: a follow-up chip only fills the composer.')
