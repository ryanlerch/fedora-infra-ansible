#!/bin/bash

## Setup basic environment variables.
HOMEDIR=/mnt/fedora/app/fi-repo/rhel/rhel8
BINDIR=/usr/local/bin

ARCHES="aarch64 ppc64le s390x x86_64"
DATE=$(date -Ih | sed 's/+.*//')

DATEDIR=${HOMEDIR}/koji/${DATE}
TIME_FILE=${DATEDIR}/timestamp

##
## Make a directory for where the new tree will live. Use a new date
## so that we can roll back to an older release or stop updates for
## some time if needed. 
if [ -d ${DATEDIR} ]; then
    echo "Directory already exists. Please remove or fix"
    exit
else
    mkdir -p ${DATEDIR}
    touch ${TIME_FILE}
fi

##
## Go through each architecture and split out the trees.
## 
for ARCH in ${ARCHES}; do
    # The archdir is where we daily download updates for rhel8
    ARCHDIR=${HOMEDIR}/${ARCH}
    if [ ! -d ${ARCHDIR} ]; then
	echo "Unable to find ${ARCHDIR}"
	exit
    fi

    # We consolidate all of the default repositories and remerge them
    # in a daily tree. This allows us to point koji at a particular
    # day if we have specific build concerns.
    OUTDIR=${DATEDIR}/${ARCH}
    mkdir -p ${OUTDIR}
    if [ ! -d ${OUTDIR} ]; then
	echo "Unable to find ${ARCHDIR}"
	exit
    else
	cd ${OUTDIR}
    fi

    # Begin splitting the various packages into their subtrees
    ${BINDIR}/splitter.py --action hardlink --target RHEL-8-001 ${ARCHDIR}/rhel-8-for-${ARCH}-baseos-rpms/ --only-defaults &> /dev/null
    if [ $? -ne 0 ]; then
	echo "splitter ${ARCH} baseos failed"
	exit
    fi
    ${BINDIR}/splitter.py --action hardlink --target RHEL-8-002 ${ARCHDIR}/rhel-8-for-${ARCH}-appstream-rpms/ --only-defaults &> /dev/null
    if [ $? -ne 0 ]; then
	echo "splitter ${ARCH} appstream failed"
	exit
    fi
    ${BINDIR}/splitter.py --action hardlink --target RHEL-8-003 ${ARCHDIR}/codeready-builder-for-rhel-8-${ARCH}-rpms/ &> /dev/null
    if [ $? -ne 0 ]; then
	echo "splitter ${ARCH} codeready failed"
	exit
    fi

    # Copy the various module trees into RHEL-8-001 where we want them
    # to work.
    echo "Moving data to ${ARCH}/RHEL-8-001"
    cp -anlr RHEL-8-002/* RHEL-8-001
    cp -anlr RHEL-8-003/* RHEL-8-001
    # Go into the main tree
    pushd RHEL-8-001

    find . -type f -print | xargs touch -r ${TIME_FILE}
    # Mergerepo didn't work so lets just createrepo in the top directory.
    createrepo_c .  &> /dev/null
    popd

    # Cleanup the trash 
    rm -rf RHEL-8-002 RHEL-8-003
#loop to the next
done

## Set up the builds so they are pointing to the last working version
cd ${HOMEDIR}/koji/
if [[ -e latest ]]; then
    if [[ -h latest ]]; then
	rm -f latest
    else
	echo "Unable to remove staged. it is not a symbolic link. Trying to move to latest_${DATE}."
	if [[ -d latest_${DATE} ]]; then
	    echo "latest_${DATE} exists. Exiting"
	    exit
	else
	    mv latest latest_${DATE}
	fi
    fi
else
    echo "No latest link found"
fi

echo "Linking ${DATE} to latest"
ln -s ${DATE} latest


## Wish there was a clean way to tell koji to figure out the new repos
## from batcave.

