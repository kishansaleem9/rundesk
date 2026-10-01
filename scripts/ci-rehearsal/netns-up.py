#!/usr/bin/env python3
"""Inside a fresh network namespace: loopback up, and a veth pair with an address.

With loopback alone Chromium reports itself offline, and the app draws its
offline banner over the top of every page, where it takes the clicks the
suites make. The runner is online. A veth pair is enough for the browser to
say online while nothing outside this machine is reachable. This kernel has
no dummy interfaces, which would have been the obvious choice.

Needs pyroute2 (`pip install pyroute2`).
"""
from pyroute2 import IPRoute

ip = IPRoute()
ip.link('set', index=ip.link_lookup(ifname='lo')[0], state='up')
ip.link('add', ifname='rh0', kind='veth', peer='rh1')
near = ip.link_lookup(ifname='rh0')[0]
far = ip.link_lookup(ifname='rh1')[0]
ip.addr('add', index=near, address='10.99.0.1', prefixlen=24)
ip.link('set', index=far, state='up')
ip.link('set', index=near, state='up')
