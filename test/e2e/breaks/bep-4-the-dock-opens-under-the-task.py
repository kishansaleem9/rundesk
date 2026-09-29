# THE DOCK OPENS UNDER THE TASK IT WAS OPENED FROM.
#
# What the dock did before it was lifted: the sheet's layer is `fixed inset-0
# z-50`, the dock stood at `z-40` / `z-auto`, so Brain² opened it in the DOM,
# `isVisible()` true, pointed at the task — and out of reach under the sheet.
# Every check that only asks whether an element exists passes on this build;
# the one that asks what a press would land on does not.
#
# Reddens: brain-entry-points: "and the dock stands beside the task, not under it: a press on its chip reaches the chip, the sheet’s own Brain² is still within reach, and the sheet ends where the dock begins"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.tsx'
a = """            'fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-border/60 shadow-xl md:static md:z-auto md:w-[380px] md:max-w-none md:shadow-none',
            aiBeside && 'z-50 md:relative md:z-50',
"""
b = """            'fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-border/60 shadow-xl md:static md:z-auto md:w-[380px] md:max-w-none md:shadow-none',
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('routes/app.tsx: the dock is no longer lifted over the task sheet it was opened from.')
