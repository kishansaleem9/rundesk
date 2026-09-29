# THE PLATFORM'S SWITCH IS APPLIED AFTER THE WORKSPACE'S, so the less specific wins.
# Reddens: flag-resolution: "the workspace’s own switch turning Forms on wins over the platform’s off — told on, and its routes answer"
import io
p = '/home/user/rundesk/apps/api/src/modules/feature-flags/feature-flags.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    const order = ['global', 'workspace', 'role', 'user'] as const\n"
b = "    const order = ['workspace', 'global', 'role', 'user'] as const\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("flr-2-platform-over-workspace: the platform's switch wins over the workspace's")
