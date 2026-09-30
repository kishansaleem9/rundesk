# A LIST'S EXPORT IS NAMED IN ASCII ALONE (`found-30-sep/list-export-saved-as-list-csv`): the name keeps
# `[\w \-.]` and drops the rest, as it did, with no `filename*`, so "Übersicht — قائمة" goes out as
# "bersicht  .csv" and is saved so, and a list named in Arabic alone as "list.csv".
# Reddens: list-export: "a list named in any script is exported under its whole name — in filename*, beside a plain ASCII filename"
#   "and a list named in another script is saved under its whole name too"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
a = "    res.header('Content-Disposition', downloadName(out.name, `.${out.extension}`, 'list').disposition)\n"
b = "    res.header('Content-Disposition', `attachment; filename=\"${out.name.replace(/[^\\w \\-.]/g, '').trim() || 'list'}.${out.extension}\"`)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lxn-1-the-list-s-name-goes-out-in-ascii: the export is named in ASCII alone')
