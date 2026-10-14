# A TOOL’S 429 IS NOT WAITED OUT: THE IMPORT STOPS.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "when Asana asks to wait (429), the import waits and asks again; and a person of the tool is mapped only to a member here — not to somebody else, nor to a guest"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-http.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (res.status === 429 && attempt < 5) {\n',
     '      if (res.status === 429 && attempt < 0) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-29-no-waiting: A TOOL’S 429 IS NOT WAITED OUT: THE IMPORT STOPS.')
