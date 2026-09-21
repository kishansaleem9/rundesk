# The calendar picker goes back to having no Escape handler. Its `fixed inset-0` click
# catcher then swallows every press in the planner header until a click happens to land on
# the catcher itself - Settings, the view switcher, the arrows - and a keyboard user cannot
# close it at all. Frame `13:28`; the same defect `quick-create-modal.tsx` carries a note
# about, found the same way.
# Reddens: calendar-accounts: the SS-V2-14e Conferencing group - the suite throws on
#          `locator.click: Timeout` reaching `planner-settings` and never runs check 33
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "  useEffect(() => {\n    if (!calendarsOpen) return\n    const onKey = (e: KeyboardEvent) => {\n      if (e.key === 'Escape') setCalendarsOpen(false)\n    }\n    document.addEventListener('keydown', onKey)\n    return () => document.removeEventListener('keydown', onKey)\n  }, [calendarsOpen])"
b = '  useEffect(() => {\n    if (!calendarsOpen) return\n    return undefined\n  }, [calendarsOpen])'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: Escape no longer closes the calendar picker.')
