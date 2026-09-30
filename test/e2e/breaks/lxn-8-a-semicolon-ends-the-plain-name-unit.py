# A SEMICOLON OR A PERCENT SIGN IS KEPT IN THE PLAIN NAME (`found-30-sep/list-export-saved-as-list-csv`): a list
# called "semi;colon%20" goes out as `filename="semi;colon%20.csv"`, which a lenient parser ends at the semicolon,
# and one that decodes the plain name reads "%20" as a space.
# Reddens: unit: download-name.test.ts "lets nothing in a name end the header early, start another, or name a path"
import io
p = '/home/user/rundesk/apps/api/src/common/export/download-name.ts'
a = "      .replace(/[%;]/g, '_')\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lxn-8-a-semicolon-ends-the-plain-name-unit: ; and % stay in the plain name')
