# The setup stops being written, so every recording starts from the defaults.
#
# `writeClipSetup` keeps its try/catch and loses the line inside it. The panel
# still works, the choice still applies to the recording being made, and the
# next one opens on 1080p / Entire screen / Default again — so somebody who
# records at 720p with a headset sets it up every single time, which the
# module's own comment gives as the reason the store exists.
#
# The catch block is what makes the deletion look harmless: its comment says "a
# choice that cannot be remembered still applies to this recording", which is
# true and is about the STORAGE failing. Deleting the write makes that sentence
# describe the normal path.
#
# ONE CHECK, THE LAST, and the suite reads it from a fresh panel rather than
# from the component: "the point is that the next recording starts where the
# last one left off." A check on the select's value straight after choosing it
# would pass here.
#
# ALSO CAUGHT BY `clip-capture.test.ts`, 19 pass / 1 fail — the store is pure
# enough to test against a stubbed `localStorage`.
#
# Reddens: clip-setup: "a new recording opens on the setup that was used last"
import io
p = '/home/user/rundesk/apps/web/src/lib/clip-capture.ts'
a = """    window.localStorage.setItem(KEY, JSON.stringify(setup))
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clip-capture.ts: the chosen setup is no longer remembered.')
