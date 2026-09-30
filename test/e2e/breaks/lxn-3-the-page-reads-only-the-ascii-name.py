# THE PAGE READS ONLY THE ASCII NAME (`found-30-sep/list-export-saved-as-list-csv`): a download is saved under
# the plain `filename`, never `filename*`, so a list named in another script is saved under its name stripped to
# ASCII — "Ubersicht.csv" for "Übersicht — قائمة".
# Reddens: list-export: "and a list named in another script is saved under its whole name too"
import io
p = '/home/user/rundesk/apps/web/src/lib/content-disposition.ts'
a = "  const extended = /filename\\*\\s*=\\s*([^']*)'[^']*'([^;]+)/i.exec(header)\n"
b = "  const extended = null as RegExpExecArray | null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lxn-3-the-page-reads-only-the-ascii-name: filename* is never read')
