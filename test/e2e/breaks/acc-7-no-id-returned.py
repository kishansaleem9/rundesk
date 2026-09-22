# The action succeeds and says so, but hands back nothing addressable — leaving the
# sentence as the only account of what happened, which is where this row started.
# ITS EVIDENCE IS ONE NAMED FAILURE AND AN EXPLICIT SHORT RUN, and that is the
# honest shape for this patch rather than a gap to close. It makes the action
# report success with no container id, so `and hands back the id of what it
# made` reddens — which is the defect, exactly named — and the twenty-seven
# checks after it ADDRESS that id: the list the action made, its statuses, its
# tasks, the refs that resolve to it. There is nothing for them to be about.
#
# The suite says so in its own words rather than dying quietly: the check fails
# with the result it got, the run stops with `no list id was returned; the
# database checks cannot address anything`, and the `EXPECTED_CHECKS` guard
# prints `ran 6 checks, expected 33`. `break-report.sh` classifies it as SHORT,
# not as a patch that reddened six checks, which is the distinction that
# matters — a short run counted as a reddening is the confident zero this whole
# audit is about.
#
# Expect: SHORT
#
# Reddens: ai-create-containers: "and hands back the id of what it made"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = """          container: {
            kind: result.kind,
            id: result.id,
            name: result.name,
            path: result.path,
            spaceId: result.spaceId,
          },
"""
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: a created container is no longer reported by id.')
