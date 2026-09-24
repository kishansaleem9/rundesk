# THE LIST MATCHES A TAG'S EXACT CASE again: "standup" does not find "Standup".
# Reddens: meeting-tags: "the list asked for a tag finds every meeting carrying it, whatever its case — and no other"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = '            ? sql`exists (select 1 from unnest(${meetings.tags}) as t where lower(t) = lower(${tag}))`\n'
b = '            ? sql`${meetings.tags} @> ARRAY[${tag}]::text[]`\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mtg-1-tag-matched-by-case: the tag filter compares exact case')
