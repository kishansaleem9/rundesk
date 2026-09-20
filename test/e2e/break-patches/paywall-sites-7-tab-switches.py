# The tab opens the paywall AND switches to the view behind it — the modal
# becomes decoration over a feature that was handed over anyway.
# Reddens: "and leaves you where you were rather than on an empty view".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = "          if (tb.id === 'team' && !requireFeature(TEAM_VIEW_GATE)) return"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
b = "          if (tb.id === 'team') requireFeature(TEAM_VIEW_GATE)"
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('[break 7] dropped the early return from the Team tab in the list route —')
print('          the paywall opens but the view is switched to regardless.')
