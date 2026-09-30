# THE PLAYBACK WINDOW IGNORES ITS SETTING (`resume-defects/resume-7`).
#
# `CLIP_PLAYBACK_URL_SECONDS` is read and thrown away: every view signs for the
# hour. Nothing a person sees changes; the lanes and CI can no longer wait a
# window out, so "the link still plays after it" stops being measurable.
#
# Reddens: unit: clips.service.test.ts "opening it signs the clip again, for the configured time, and says what it is"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "    this.playbackSeconds = Number.isFinite(seconds) && seconds >= 1 ? Math.floor(seconds) : PLAYBACK_URL_SECONDS\n"
b = "    this.playbackSeconds = Number.isFinite(seconds) && seconds >= 1 ? PLAYBACK_URL_SECONDS : PLAYBACK_URL_SECONDS\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-9-the-window-is-not-configurable-unit: the playback window is always an hour')
