# DROPDOWNS AS TALL AS THEIR CONTENT: the user menu runs past a 900px window, Sign out with it.
# Reddens: sw-api-cache: "and the topbar’s Sign out — its menu inside a 1440×900 window — does the same for a member"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
a = "        'z-50 min-w-[10rem] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overflow-x-hidden rounded-lg border border-border/60 bg-popover p-1 text-popover-foreground shadow-glow',\n"
b = "        'z-50 min-w-[10rem] overflow-hidden rounded-lg border border-border/60 bg-popover p-1 text-popover-foreground shadow-glow',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("swc-7-menu-runs-off-screen: applied")
