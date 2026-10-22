# budjet

A local-first budgeting app that runs in the browser and keeps the user's data on their own device.

## Language

**Data Folder**:
The directory on the user's device, chosen by the user, where budjet keeps their data. Getting it onto other devices is the job of whatever sync service the user points at that folder; budjet never talks to a sync service itself.
_Avoid_: Vault, workspace, sync folder, cloud storage

## Delivery

**Release**:
A version of budjet identified by a git tag, with its release notes and its deployed build.
_Avoid_: Deploy (a deploy is one step of a release), version bump
