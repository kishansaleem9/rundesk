# "See N more" printing the section's total rather than what it is holding
# back. The control is there, it expands, and its number is wrong — the frame's
# "See 92 more" is a number, not a word.
#
# Reddens: template-center: "and offers \"See 1 more\" — the number it is actually holding back"
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="{t('templates.seeMore', { count: more })}"
assert s.count(a)==1, 'anchor not found exactly once'
io.open(p,'w',encoding='utf-8').write(
    s.replace(a,"{t('templates.seeMore', { count: rows.length })}"))
print('BREAK 4: "See N more" now prints the section total (7) instead of the held-back 1')
