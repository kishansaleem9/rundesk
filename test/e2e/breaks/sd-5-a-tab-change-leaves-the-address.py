# A SETTINGS TAB CHOSEN IS NOT WRITTEN TO THE ADDRESS (`found-7-oct/settings-depth-reads-the-tabs-after-a-fixed-wait`).
#
# The settings page's tab is its address: `?tab=` names it, and choosing a tab
# writes the new one there, so what a person sends or reloads is what they are
# looking at. Write the tab the address already names instead, and pressing
# Trash leaves the page, and its address, on Members.
#
# Reddens: settings-depth:
#   "moving to another tab replaces it in the address"
#   "and reopening that address returns the same tab"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = "      search: { tab: next === 'general' ? undefined : next },\n"
b = "      search: { tab: tabFromUrl },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sd-5-a-tab-change-leaves-the-address: choosing a settings tab no longer writes it to the address')
