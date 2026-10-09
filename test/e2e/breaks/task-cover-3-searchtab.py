# Check 14 — the picker's tabs out of ClickUp's order: Search put first.
#
# Re-aimed 8 October: this put a Search tab back over nothing, while the check
# held its absence. The tab is the photo library's now (`commit-log/log-601eacc-1`),
# and the check asks for ClickUp's five in its order — Gallery, Upload, Link,
# Search, Attachments — so the break moves Search to the front.
#
# Reddens: task-cover: "the picker has ClickUp’s five tabs in its order — Gallery, Upload, Link, Search, Attachments — Search the photo library’s"
import io
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
s = io.open(p, encoding='utf-8').read()
search = "              <TabsTrigger value=\"search\" data-testid=\"cover-tab-search\">{t('coverImage.tab.search')}</TabsTrigger>\n"
gallery = "              <TabsTrigger value=\"gallery\" data-testid=\"cover-tab-gallery\">{t('coverImage.tab.gallery')}</TabsTrigger>\n"
for a in (search, gallery):
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(search, '').replace(gallery, search + gallery)
io.open(p, 'w', encoding='utf-8').write(s)
print('BROKE check 14: the Search tab comes first, before Gallery')
