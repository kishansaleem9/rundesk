# The feed drawn oldest first, as a log is read, where ClickUp's is newest first.
#
# Reddens: list-views: "the Activity tab draws the feed newest first, under Today, the status change on top"
import io
p="/home/user/rundesk/apps/web/src/components/list-views/activity-view.tsx"
s=io.open(p,encoding='utf-8').read()
a="    return out\n  }, [feed.data])"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"    return out.reverse()\n  }, [feed.data])"))
