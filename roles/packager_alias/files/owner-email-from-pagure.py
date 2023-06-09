#!/usr/bin/python -tt

"""
This script is ran as a cronjob and bastion.

Its goal is to generate all the <pkg>-maintainers email aliases we provide
"""

import time

import requests

from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry


def retry_session():
    session = requests.Session()
    retry = Retry(
        total=5,
        read=5,
        connect=5,
        backoff_factor=0.3,
        status_forcelist=(500, 502, 504),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session


pagure_url = 'https://src.fedoraproject.org/'
pagure_group_url = pagure_url + '/api/0/group/{group}'
project_to_email = {}


def get_pagure_projects():
    pagure_projects_url = pagure_url + '/api/0/projects?page=1&per_page=100&fork=false'
    session = retry_session()
    while pagure_projects_url:
        cnt = 0
        while True:
            try:
                response = session.get(pagure_projects_url)
                data = response.json()
                break
            except Exception:
                if cnt == 4:
                    raise

                cnt += 1
                time.sleep(30)

        for project in data['projects']:
            yield project
        # This is set to None on the last page.
        pagure_projects_url = data['pagination']['next']


def get_pagure_project_overrides(fullname_roject, default_email):
    pagure_overrides_url = pagure_url + '_dg/bzoverrides/{}'.format(fullname_roject)
    session = retry_session()
    data = {}
    cnt = 0
    while True:
        try:
            response = session.get(pagure_overrides_url)
            data = response.json()
            break
        except Exception:
            cnt += 1
            if cnt == 4:
                raise
            time.sleep(30)
    return data.get("fedora_assignee", default_email), data.get("epel_assignee", default_email)


def override_to_emails(override):
    users = [override]
    if override.startswith('@'):
        group = override[1:]
        response = session.get(pagure_group_url.format(group=group))
        data = response.json()
        users = data['members']
    return {'{0}@fedoraproject.org'.format(user) for user in users}


session = retry_session()
group_data = {}
for project in get_pagure_projects():
    users = set(project['access_users']['owner']) | \
            set(project['access_users']['admin']) | \
            set(project['access_users']['commit'])

    fedora_override, epel_override = get_pagure_project_overrides(
           project['fullname'],
           project['access_users']['owner'][0])

    groups = set()
    for group_kind in ('admin', 'commit'):
        for group in project['access_groups'][group_kind]:
            groups.add(group)

    for group in groups:
        if group in group_data:
            users = users | group_data[group]
            continue

        cnt = 0
        while True:
            try:
                response = session.get(pagure_group_url.format(group=group))
                data = response.json()
                break
            except Exception:
                if cnt == 4:
                    raise
                cnt += 1
                time.sleep(30)

        group_members = data['members']
        users = users | set(group_members)
        group_data[group] = set(group_members)

    project_alias = '{0}-maintainers'.format(project['name'])
    # If there is a namespace, prefix the email with it plus a dash
    if project['namespace'] and project['namespace'] != 'rpms':
        project_alias = '{0}-{1}'.format(project['namespace'], project_alias)

    # Use the @fedoraproject.org email alias instead of looking their email up
    # in FAS
    emails = ['{0}@fedoraproject.org'.format(user) for user in users]

    # Handle case-insensitivity in postfix by unioning things.
    project_alias = project_alias.lower()
    fedora_alias = '{0}-fedora'.format(project_alias)
    epel_alias = '{0}-epel'.format(project_alias)

    if project_alias in project_to_email:
        project_to_email[project_alias] = project_to_email[project_alias].union(emails)
    else:
        project_to_email[project_alias] = set(emails)

    project_to_email[fedora_alias] = override_to_emails(fedora_override)
    project_to_email[epel_alias] = override_to_emails(epel_override)

for project_alias in project_to_email:
    emails = list(project_to_email[project_alias])
    print('{0}: {1}'.format(project_alias, ','.join(sorted(emails))))
