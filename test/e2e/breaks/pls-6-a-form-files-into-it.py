# A FORM FILES INTO A PERSONAL LIST.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "and nothing but tasks is made in its place — a list, a folder, a doc each refused in words (403), and no form files into it (400) — and the owner does not rename the space it lives in (read by SQL)"
#
# What anybody sends lands in somebody’s private list.
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (list.personalOf) throw new BadRequestException('A form cannot file into a Personal List')\n",
     "    if (list.personalOf && false) throw new BadRequestException('A form cannot file into a Personal List') // BROKEN\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-6-a-form-files-into-it: A FORM FILES INTO A PERSONAL LIST.')
