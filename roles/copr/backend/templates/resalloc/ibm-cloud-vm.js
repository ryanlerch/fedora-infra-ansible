#! /usr/bin/python3

"""
Start a new VM in IBM Cloud under the copr-team account.
"""

import argparse
import datetime
import logging
import pipes
import re
import subprocess
import sys

from ibm_vpc import VpcV1
from ibm_cloud_sdk_core.authenticators import IAMAuthenticator
from ibm_cloud_sdk_core import ApiException

DEFAULT_PLAYBOOK = "{{ provision_directory }}/libvirt-provision.yml"
DEFAULT_TOKEN_FILE = "/var/lib/resallocserver/.ibm-cloud-token"

subnet_id = "02f7-98674f68-aae1-4ea1-a889-5a0b7a07f4b8"
image_id = "r022-ce9f9b97-1d1c-46d0-9699-6a1c7e6b2e45"
vpc_id = "r022-8438169e-d881-4bda-b603-d31fdf0f8b3a"
security_group_id = "r022-bf49b90e-c00f-4c68-8707-2936b47b286b"
my_key_id = "r022-3918e368-8e00-4e23-9119-5e3ce1eb33bd"
profile = "cz2-2x4"
zone_name = "jp-tok-2"


def bind_floating_ip(service, instance_id, log):
    """
    Assign an existing Floating IP to given instance.
    """

    log.info("Bind floating IP")
    response_list = service.list_floating_ips().get_result()['floating_ips']
    floating_ip_id = None
    for item in response_list:
        log.info("%s\t%s\t%s", item['id'], item['name'], item['status'])
        if item["status"] == "available":
            floating_ip_id = item['id']
            floating_ip_address =  item['address']
            break
    if floating_ip_id is None:
        log.error("No available floating IP")
        sys.exit(1)

    response_list = service.list_instance_network_interfaces(instance_id)
    response_list = response_list.get_result()['network_interfaces']
    log.info(response_list)
    for item in response_list:
        log.info("{}\t{}".format(item['id'], item['name']))
    network_interface_id = response_list[0]['id']
    log.info("Network interface ID: {}".format(network_interface_id))
    service.add_instance_network_interface_floating_ip(
        instance_id,
        network_interface_id,
        floating_ip_id,
    )
    log.info("Floating IP: %s", floating_ip_address)
    return floating_ip_address


def run_playbook(host, opts):
    """
    Run ansible-playbook against the given hostname
    """
    cmd = ["ansible-playbook", opts.playbook, "--inventory", "{},".format(host)]
    subprocess.check_call(cmd)


def create_instance(service, instance_name, opts, log):
    """
    Start the VM, name it "instance_name"
    """
    instance_prototype_model = {
        "keys": [{"id": my_key_id}],
        "name": instance_name,
        "profile": {"name": profile},
        "vpc": {
            "id": vpc_id,
        },
        "boot_volume_attachment": {
            "volume": {
                "name": instance_name + "-root",
                "profile": {
                    "name": "general-purpose",
                },
            },
            "delete_volume_on_instance_delete": True,
        },
        "image": {"id": image_id},
        "primary_network_interface": {
            'name': 'primary-network-interface',
            'subnet': {
                "id": subnet_id,
            },
            "security_groups": [
                {"id": security_group_id},
            ],
        },
        "zone": {
            "name": zone_name,
        },
        "volume_attachments": [{
            "volume": {
              "name": instance_name + "-swap",
              "capacity": 168,
              "profile": {"name": "general-purpose"},
            },
            "delete_volume_on_instance_delete": True,
        }],
    }

    instance_created = None
    try:
        response = service.create_instance(instance_prototype_model)
        instance_created = instance_name
        log.debug("Instance response: %s", response)
        log.debug("Instance response[get_result]: %s", response.get_result())
        instance_id = response.get_result()['id']
        log.info("Instance ID: %s", instance_id)
        ip_address = bind_floating_ip(service, instance_id, log)
        _wait_for_ssh(ip_address)
        run_playbook(ip_address, opts)
        # Tell the Resalloc clients how to connect to this instance.
        print(ip_address)
    except:
        if instance_created:
            delete_instance(service, instance_name, log)
        raise


def delete_instance(service, instance_name, log):
    """ Delete instance by it's name """
    log.info("Deleting instance %s", instance_name)
    response_list = service.list_instances().get_result()['instances']
    delete_instance_id = None
    for item in response_list:
        log.debug("Available: %s %s %s", item['id'], item['name'], item['status'])
        if instance_name == item['name']:
            delete_instance_id = item['id']
    if delete_instance_id is None:
        log.error("Could not find instance {}".format(instance_name))
        sys.exit(1)
    service.delete_instance(delete_instance_id)


def _get_arg_parser():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token-file", default=DEFAULT_TOKEN_FILE)
    parser.add_argument("--log-level", default="info")
    subparsers = parser.add_subparsers(dest='subparser')
    parser_create = subparsers.add_parser(
        "create", help="Create an instance in IBM Cloud")
    parser_create.add_argument("name")
    parser_create.add_argument("--playbook", default=DEFAULT_PLAYBOOK)
    parser_delete = subparsers.add_parser(
        "delete", help="Delete instance by it's name from IBM Cloud")
    parser_delete.add_argument("name")
    return parser


def _wait_for_ssh(floating_ip):
    cmd = ["resalloc-aws-wait-for-ssh",
           "--log", "debug",
           "--timeout", "240",
           floating_ip]
    subprocess.check_call(cmd)


def _main():
    opts = _get_arg_parser().parse_args()
    log_level = getattr(logging, opts.log_level.upper())
    logging.basicConfig(format='%(levelname)s: %(message)s', level=log_level)
    log = logging.getLogger()

    cmd = "source {} ; echo $IBMCLOUD_API_KEY".format(
        pipes.quote(opts.token_file))
    output = subprocess.check_output(cmd, shell=True)
    token = output.decode("utf-8").strip().rsplit("\n", maxsplit=1)[-1]
    authenticator = IAMAuthenticator(token)

    now = datetime.datetime.now()
    service = VpcV1(now.strftime('%Y-%m-%d'), authenticator=authenticator)

    # We work with Tokyo only for now.
    service.set_service_url("https://jp-tok.iaas.cloud.ibm.com/v1")

    if opts.subparser == "create":
        create_instance(service, opts.name, opts, log)
    elif opts.subparser == "delete":
        delete_instance(service, opts.name, log)


if __name__ == "__main__":
    _main()


# vi: ft=python
