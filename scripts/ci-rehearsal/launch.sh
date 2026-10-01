#!/bin/bash
# Run one CI job's rehearsal the way a fresh runner would see this machine.
#
#   bash scripts/ci-rehearsal/launch.sh JOB CPUS NET WORK LOGDIR [rehearse.py args...]
#
#   CPUS  a taskset list, e.g. 0,1; the runner has two
#   NET   host        this machine's network
#         none        no network beyond this machine, but online to a browser
#         private-pg  the same, with a Postgres 16 of its own on 5432 holding
#                     an empty rundesk_calls, as the job's service container has
#   WORK  a directory holding rundesk/rundesk (checkout.sh makes one), seen as
#         /home/runner/work, so two jobs rehearse at once from two checkouts
#         at the runner's path
#
# In its own mount and PID namespace: /tmp is empty, /home/user (this
# checkout) is hidden, and every process the job leaves ends with it.
{
set -u
JOB=$1 CPUS=$2 NET=$3 WORK=$4 LOGDIR=$5
shift 5
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETFLAG=
[ "$NET" != host ] && NETFLAG=-n
# Outside /home/user, which the namespace hides.
mkdir -p /home/runner/ci-rh /home/runner/work
cp "$HERE/rehearse.py" "$HERE/netns-up.py" /home/runner/ci-rh/
exec unshare -m -p -f --mount-proc $NETFLAG --propagation private bash -c '
  set -e
  # Everything the job starts, its own Postgres too, shares its CPUs.
  taskset -pc "$3" $$ > /dev/null
  mount -t tmpfs -o size=8g tmpfs /tmp
  mount -t tmpfs tmpfs /home/user
  mount --bind "$2" /home/runner/work
  [ "$1" != host ] && python3 /home/runner/ci-rh/netns-up.py
  if [ "$1" = private-pg ]; then
    PGBIN=/usr/lib/postgresql/16/bin
    D=/tmp/pg-rehearsal
    mkdir -p "$D" && chown postgres "$D"
    # The service image initialises with LANG=en_US.utf8 and its superuser,
    # and en_US sorts text differently from the C.UTF-8 of the lanes.
    runuser -u postgres -- "$PGBIN/initdb" -D "$D/data" -U rundesk -A trust --locale=en_US.utf8 > "$D/initdb.log" 2>&1
    runuser -u postgres -- "$PGBIN/pg_ctl" -D "$D/data" -l "$D/server.log" -w \
      -o "-p 5432 -k /tmp -c listen_addresses=localhost" start > /dev/null
    runuser -u postgres -- "$PGBIN/createdb" -h /tmp -U rundesk rundesk_calls
  fi
  shift 3
  mkdir -p /home/runner/work/_temp
  exec python3 /home/runner/ci-rh/rehearse.py "$@"
' rh "$NET" "$WORK" "$CPUS" "$JOB" "$LOGDIR" "$@"
}
