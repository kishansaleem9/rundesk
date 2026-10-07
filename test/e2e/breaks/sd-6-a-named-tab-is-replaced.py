# A SETTINGS TAB NAMED IN THE ADDRESS IS REPLACED BY THE LANDING TAB (`found-7-oct/settings-depth-reads-the-tabs-after-a-fixed-wait`).
#
# Once the page knows which tabs its reader may open, it sends a reader whose
# address names a tab they may not open, or none, to the one they land on. Send
# everybody there, and an address naming Members is rewritten as soon as the
# tabs are drawn: what was sent is not what opens.
#
# Reddens: settings-depth:
#   "arriving at a named tab keeps it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = "    if (tabFromUrl ? !access.tabs.includes(tabFromUrl) : !access.tabs.includes('general')) {\n"
b = "    if (tabFromUrl !== landingTab(access.tabs)) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sd-6-a-named-tab-is-replaced: an address naming a tab is rewritten to the landing tab')
