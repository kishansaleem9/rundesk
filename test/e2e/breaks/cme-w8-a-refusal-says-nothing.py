# A CLIP ITS LINK DOES NOT OPEN IS AN EMPTY BOX: why is not said.
# (`resume-defects/s4-clip-link`, `ledger-rows/row-1307`)
# Reddens: clip-link-embeds: "a deleted clip’s link is said to be unavailable, not drawn as a player that fails"
import io
p = '/home/user/rundesk/apps/web/src/components/clip-embed.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        {signIn ? t('clipEmbed.signIn') : t('clipEmbed.unavailable')}\n",
     "        {signIn ? t('clipEmbed.signIn') : ''} {/* BROKEN: the refusal says nothing */}\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cme-w8-a-refusal-says-nothing: a refusal says nothing')
