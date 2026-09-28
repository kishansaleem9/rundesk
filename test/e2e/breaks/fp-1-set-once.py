# The pill painted once on mount and never again. In a screenshot this is
# indistinguishable from a live countdown, which is exactly why "2h 55m left"
# frozen forever is worse than no countdown at all — it is read as current.
# Reddens: focus-pill: "the pill MOVES while you watch it (${JSON.stringify(firstText)} → ${JSON.stringify(secondText)})"
#   or "and counts DOWN (${firstLeft}s → ${secondLeft}s left)"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-focus-tab-title.ts'
a = """    paint()
    return subscribeSecond(paint)
  }, [workspaceId, latest, setDayStart])

  return running
"""
b = """    paint()
    return () => {}
  }, [workspaceId, latest, setDayStart])

  return running
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('use-focus-tab-title.ts: the header pill no longer subscribes to the clock — it is painted once and frozen.')
