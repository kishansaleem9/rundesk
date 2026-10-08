# THE SAVE DIALOG'S CHIPS SHOW A TAG AS TYPED AGAIN, where the server keeps it
# in lower case (`found-30-sep/template-tags-keep-their-case`).
# Reddens: template-center: "typed into the save dialog, Q3, \"  Launch   day \" and q3 show as q3 and launch day before Save — as they will be kept"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
a = "      const tag = part.trim().replace(/\\s+/g, ' ').toLowerCase()\n      if (tag && !next.some((v) => v.toLowerCase() === tag)) next = [...next, tag]\n"
b = "      const tag = part.trim().replace(/\\s+/g, ' ')\n      if (tag && !next.some((v) => v.toLowerCase() === tag.toLowerCase())) next = [...next, tag]\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-37-the-chips-keep-their-case: the chips keep the typed case')
