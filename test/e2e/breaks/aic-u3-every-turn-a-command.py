# EVERY COMMAND TURN IS FILED AS `command`.
# (`ledger-rows/row-2294`)
# Reddens: unit: ai-categories.test.ts "files a command turn by what it reached for, so the external tiles count only those"
#
# What the turn reached for is not read, so the connected apps' tiles never move.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-connected.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const used = content.filter((b) => b.type === 'tool_use').map((b) => b.name ?? '')\n",
     "  const used = content.filter((b) => b.type === 'tool_use' && b.type !== 'tool_use').map((b) => b.name ?? '')\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-u3-every-turn-a-command: every command turn is filed as command')
