# THE ZIP'S NAME IS SENT IN ASCII ALONE: no `filename*`, so a task titled in Arabic gives its zip the ASCII
# that is left of its title. Before the lanes ran their suites in a UTF-8 locale
# (`found-30-sep/lanes-save-downloads-in-ascii`) no browser check could see this: the name was "download"
# either way, and only the unit claim of `dla-21` reddened.
# Reddens: task-attachments: "and a task titled in Arabic has its zip saved under that title, not as \"download\""
import io
p = '/home/user/rundesk/apps/api/src/common/export/download-name.ts'
a = '    disposition: `attachment; filename="${asciiBase}${suffix}"; filename*=UTF-8\'\'${encodeExtValue(fileName)}`,\n'
b = '    disposition: `attachment; filename="${asciiBase}${suffix}"`,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tat-13-the-zip-is-named-in-ascii-alone: download-name.ts: the disposition carries no filename*, only the ASCII name.')
