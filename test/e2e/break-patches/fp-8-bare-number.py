# The remainder rendered as a bare "2h 56m" with no "left" on it. The frames
# say "2h 56m left"; a number on its own beside a task name is as easily read
# as time SPENT, and the two are opposite facts.
# Reddens: focus-pill: "and carries the frame's own remainder beside it"
import io
p = '/home/user/rundesk/apps/web/src/components/app-topbar.tsx'
a = """            {t('focusPill.remaining', { remaining: running.remaining })}
"""
b = """            {running.remaining}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app-topbar.tsx: the pill shows a bare duration with no "left" on it.')
