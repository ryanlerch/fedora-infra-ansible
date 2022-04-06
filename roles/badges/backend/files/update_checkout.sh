#!/bin/bash
set -e

cd /srv/badges_checkout/
git pull >/dev/null 2>&1
( rsync --delete -ar --itemize-changes /srv/badges_checkout/rules/ /usr/share/badges/rules/ | grep -q '^>f' ) && /sbin/service fedmsg-hub restart
