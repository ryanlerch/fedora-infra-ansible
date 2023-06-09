'''
Crawler Configuration
'''

log_endpoint = "/srv/web/meetbot"
#log_endpoint = "/home/user/mote/test_data/meetbot"

# Fedora has a "teams" folder which contains
# logs from meetings started with a certain team name
# for instance, `#startmeeting famna` will save in "/teams/famna"
# Folders not in "teams" reflect the channel name of the meeting
log_team_folder = "teams"

# Directories to ignore in crawling the logs.
# These folders are ignored. The "meetbot" folder is
# an infinite loop on Fedora's meetbot instance.
ignore_dir = "meetbot"

# Location where raw logs/minutes are stored (remote)
meetbot_prefix = "http://meetbot-raw.fedoraproject.org"

# Location to fetch raw logs/minutes from (remote or local location)
# This can be a remote location, but we just so happen to have the raw
# logs/minutes served off a different http endpoint on the same box, so, use
# those.
meetbot_fetch_prefix = "http://localhost/meetbot"

# Time (in seconds) after which the log/meeting cache expires
cache_expire_time = 60 * 60 * 1


'''
Development Configuration
'''

## Don't turn this on in Fedora Infrastructure as it might allow remote execution
## of arbitrary code.
##enable_debug = True
#app_port = 5000
#app_host = "127.0.0.1"

'''
General Configuration
'''

admin_groups = ["sysadmin-mote"]

# memcached must be installed for this feature
memcached_ip = "unix:/var/run/memcached/memcached.sock"
use_memcached = True # Use a memcached store for greater performance

# JSON cache store location
json_cache_location = "/var/cache/httpd/mote/cache.json"

# Use group/name mappings fetched from GitHub
use_mappings_github = False

# If use_mappings_github is False, set alternate path
name_mappings_path = "/usr/share/mote/name_mappings.json"
category_mappings_path = "/usr/share/mote/category_mappings.json"

# Use staging Fedora Apps URL for datagrepper if in staging
{% if env == 'staging' %}
datagrepper_base_url = "https://apps.stg.fedoraproject.org"
{% else %}
datagrepper_base_url = "https://apps.fedoraproject.org"
{% endif %}
