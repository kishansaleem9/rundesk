# AN ACCENTED LETTER IS DROPPED FROM THE ASCII NAME, NOT ITS ACCENT (`found-30-sep/list-export-saved-as-list-csv`):
# without the decomposition, "Übersicht" loses its Ü and a client that reads only `filename` saves "bersicht.csv".
# Reddens: unit: download-name.test.ts "names a list or a doc after itself, whole in filename*, beside an ASCII filename"
import io
p = '/home/user/rundesk/apps/api/src/common/export/download-name.ts'
a = "      .normalize('NFKD')\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lxn-6-accents-are-dropped-with-their-letters-unit: the ASCII name is not decomposed first')
