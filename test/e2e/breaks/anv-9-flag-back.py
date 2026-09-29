# THE ANNOUNCEMENTS FLAG IS BACK IN THE REGISTRY, gating nothing, so its switch is saved again.
# Reddens: announcement-views: "switching the Announcements flag off is refused as a feature this build does not have (400) — it gated nothing — and the banner is served as before"
import io
p = '/home/user/rundesk/packages/feature-flags/src/registry.ts'
s = io.open(p, encoding='utf-8').read()
a = "  CHAT_INBOX: 'chat.inbox',\n"
b = "  CHAT_INBOX: 'chat.inbox',\n  CHAT_ANNOUNCEMENTS: 'chat.announcements',\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('anv-9-flag-back: the Announcements flag is known again')
