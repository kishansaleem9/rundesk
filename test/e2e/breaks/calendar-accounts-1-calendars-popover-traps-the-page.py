# The calendar picker goes back to having no Escape handler. Its `fixed inset-0` click
# catcher then swallows every press in the planner header until a click happens to land on
# the catcher itself - Settings, the view switcher, the arrows - and a keyboard user cannot
# close it at all. Frame `13:28`; the same defect `quick-create-modal.tsx` carries a note
# about, found the same way.
# PREDICTED A SHORT RUN, WHICH IS NOT A PREDICTION. This header used to say the
# patch "throws on `locator.click: Timeout` reaching `planner-settings` and
# never runs check 33" — a patch whose whole evidence is that the run stopped,
# recorded as 31 of 33 under a headline about the harness. The Escape press it
# breaks was a fixture step with nothing asserting it, so there was no check for
# this to redden and nothing to report but the wreckage.
#
# `calendar-accounts` now asks the question: Escape closes the picker, so a
# keyboard can get out of it. The two Settings clicks after it are bounded, and
# the suite recovers the way a mouse user has to — by clicking the catcher —
# so the Conferencing checks below fail for their own reasons or not at all.
# One check, naming the defect.
#
# Reddens: calendar-accounts: "Escape closes the calendar picker, so a keyboard
#   can get out of it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "  useEffect(() => {\n    if (!calendarsOpen) return\n    const onKey = (e: KeyboardEvent) => {\n      if (e.key === 'Escape') setCalendarsOpen(false)\n    }\n    document.addEventListener('keydown', onKey)\n    return () => document.removeEventListener('keydown', onKey)\n  }, [calendarsOpen])"
b = '  useEffect(() => {\n    if (!calendarsOpen) return\n    return undefined\n  }, [calendarsOpen])'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: Escape no longer closes the calendar picker.')
