# THE TAGS MENU SAYS ONLY "ALL" WHILE NOTHING IS CHOSEN (`ledger-rows/row-1874`).
#
# Its face borrows the scope rail's label, so the top row reads "All use
# cases", "All", "Created by anyone": the menu works and nobody looking at it
# can tell what it filters.
#
# Reddens: template-center: "and each says which it is while nothing is chosen — All use cases, All tags, Created by anyone"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
a = """            <option value="">{t('templates.tagsAll')}</option>
"""
b = """            {/* BROKEN: the Tags menu's face says "All" */}
            <option value="">{t('templates.filterAll')}</option>
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-12-tags-menu-says-all: the Tags menu reads "All"')
