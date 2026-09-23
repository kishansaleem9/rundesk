# A RECORDING RULE THAT REFUSES PASTED LINKS: every Zoom or Drive recording is lost.
# Reddens: object-key-boundaries: "while a pasted https link is stored and handed back exactly as it was pasted"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = "    if (!/^https?:\\/\\/\\S+$/i.test(value)) throw new BadRequestException('A recording link must start with http:// or https://')\n"
b = "    if (true) throw new BadRequestException('A recording link must start with http:// or https://')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-10-meeting-refuses-links: applied")
