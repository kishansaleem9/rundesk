# A RECORDING RULE THAT REFUSES EVERY KEY: no call recording is ever kept.
# Reddens: object-key-boundaries: "while the key the call’s own presign minted is attached"
import io
p = '/home/user/rundesk/apps/api/src/modules/calls/calls.service.ts'
a = '    if (!isCallRecordingKeyFor(storageKey, call.workspaceId, callId)) {\n'
# ALWAYS TRUE AT RUNTIME, NOT PROVABLY TRUE TO THE COMPILER. An unconditional
# throw or return makes the code below it unreachable, TypeScript drops every
# narrowing there, and the build refused this patch — so it ran as BUILD
# FAILED and proved nothing. The condition is a value that is always set here.
b = '    if (storageKey) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-16-call-refuses-own: applied")
