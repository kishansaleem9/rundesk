# A MEETING'S RECORDING AS IT WAS: whatever the client sent, stored.
# Reddens: object-key-boundaries: "a client cannot store a bare key as a recording — keys are written by the server"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = "    if (!/^https?:\\/\\/\\S+$/i.test(value)) throw new BadRequestException('A recording link must start with http:// or https://')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-8-meeting-bare-key-stored: applied")
