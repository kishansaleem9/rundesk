# THE TOOLS ARE A GRID IN THE USER MENU AGAIN (`found-6-oct/user-menu-hides-sign-out-below-a-scroll`).
#
# The eleven tools open from one "Personal tools" row, as ClickUp's do. Draw
# their grid in the menu itself again, as it was, and the menu is taller than
# its room in a 900 px window: it scrolls, and Sign out sits below its foot.
#
# Reddens: sw-api-cache: "the user menu shows Sign out as it opens in a 1440×900 window: inside the menu, with nothing to scroll to reach it"
import io
p = '/home/user/rundesk/apps/web/src/components/app-topbar.tsx'
pairs = [
    ("""        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="menu-tools">
            <Pin className="mr-2 h-4 w-4 text-muted-foreground" />
            {t('topbar.toolsHeading')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 p-2" data-testid="menu-tools-pins">
""", """        <div className="px-2 py-1.5" data-testid="menu-tools-pins">
"""),
    ("""          </DropdownMenuSubContent>
        </DropdownMenuSub>
""", """        </div>
"""),
]
s = io.open(p, encoding='utf-8').read()
for a, b in pairs:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('swc-9-the-tools-grid-fills-the-menu-again: the tools are a grid in the menu again')
