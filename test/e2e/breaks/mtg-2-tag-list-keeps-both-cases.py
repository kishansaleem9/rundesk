# THE TAG LIST KEEPS "Standup" AND "standup" AS TWO: two chips that look the same.
# Reddens: meeting-tags: "the tags in use are listed from every meeting — Standup once, and a tag only an old meeting carries"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = '      select distinct on (lower(t)) t as tag\n'
b = '      select distinct on (t) t as tag\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mtg-2-tag-list-keeps-both-cases: the tag list does not fold case')
