# Check 18 — the history row stops carrying the preset it ran under, so the list
# cannot tell a Trello import from a Jira one.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-import-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "                data-preset={h.sourcePreset ?? ''}"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '                data-preset=""'))
print('BROKE check 18: the history no longer says which preset a run used')
