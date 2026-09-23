# THE SCHEME TEST AS IT WAS: anything containing `://`.
# Reddens: object-key-boundaries: "nor a link in any scheme but http(s)"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = "    if (!/^https?:\\/\\/\\S+$/i.test(value)) throw new BadRequestException('A recording link must start with http:// or https://')\n"
b = "    if (!value.includes('://')) throw new BadRequestException('A recording link must start with http:// or https://')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-9-meeting-any-scheme: applied")
