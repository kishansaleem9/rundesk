# ATTACHRECORDING AS IT WAS: a prefix check, walked out of by `..`.
# Reddens: object-key-boundaries: "a recording key that starts with the call’s prefix and walks out of it is refused — the prefix check let it in"
import io
p = '/home/user/rundesk/apps/api/src/modules/calls/calls.service.ts'
a = '    if (!isCallRecordingKeyFor(storageKey, call.workspaceId, callId)) {\n'
b = '    if (!storageKey?.startsWith(`calls/${call.workspaceId}/${callId}/`)) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-15-call-prefix-check: applied")
