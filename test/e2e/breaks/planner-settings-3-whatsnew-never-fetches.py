# Leave the What's new link in the footer and never ask the server for anything. The
# pane opens, the empty state renders, and the link is a dead control wearing a
# reasonable explanation.
#
# Reddens: planner-settings: "\"What's new\" lists what the workspace actually published, both of them"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
a = "    enabled: pane === 'whatsNew' && !!workspaceId,"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = '    enabled: false, // BREAK: the pane opens and nothing is ever fetched'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("stopped the What's new pane from fetching the workspace's announcements")
