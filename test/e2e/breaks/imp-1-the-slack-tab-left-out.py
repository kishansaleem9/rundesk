# THE IMPORTS PAGE HAS NO SLACK TAB: Slack is back to a word and no control.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "the Imports page has a tab for Spreadsheet files, Document files, Confluence, Basecamp, Slack and ClickUp — and no box of tools it cannot import"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-import-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        <TabButton\n          testid="import-tab-slack"\n          active={tab === \'slack\'}\n          onClick={() => setTab(\'slack\')}\n          icon={<MessagesSquare className="h-4 w-4" />}\n          label="Slack"\n        />\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-1-the-slack-tab-left-out: the Imports page draws no Slack tab')
