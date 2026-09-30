# A CLIP'S LINK PLAYS IT FROM ITS PERMANENT PUBLIC ADDRESS (`found-30-sep/public-cdn-url-makes-every-object-public`):
# opening `/clips/<token>` answers `${R2_PUBLIC_URL}/<key>`, so the clip outlives its link: a members-only
# workspace's clip, a deleted link and an archived workspace's clip all still play from that address.
# Reddens: private-object-urls: "a clip's link plays it through a signed URL, and the library lists it signed — neither is its permanent address"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "      url: await this.r2.getObjectUrl(row.storageKey, this.playbackSeconds),\n"
b = "      url: `${process.env.R2_PUBLIC_URL}/${row.storageKey}`,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-5-a-clip-plays-at-its-public-address: a clip link plays from the public address')
