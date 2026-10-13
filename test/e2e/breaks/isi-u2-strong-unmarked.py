# JIRA’S BOLD TEXT COMES IN PLAIN.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: unit: apps/api/src/modules/integrations/app-import/app-import.test.ts "reads Atlassian’s document format as Markdown"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/rich-text.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        if (m.type === 'strong') t = `**${t}**`\n",
     "        if (m.type === 'bold') t = `**${t}**`\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-u2-strong-unmarked: JIRA’S BOLD TEXT COMES IN PLAIN.')
