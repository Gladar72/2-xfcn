#!/usr/bin/env bash
set -euo pipefail

# Expand only the mounted root partition of the specific SSD approved in
# Yandex Cloud. No formatting, unmount, restart, cleanup or data deletion.
expected_serial=fv490mv6f1fkr4v50bl5
expected_bytes=214748364800
root_device=$(readlink -f "$(findmnt -n -o SOURCE /)")
root_fs=$(findmnt -n -o FSTYPE /)
root_type=$(lsblk -dn -o TYPE -- "$root_device")
[ "$root_type" = part ] || { echo 'Unsupported root layout'; exit 1; }
parent=$(lsblk -dn -o PKNAME -- "$root_device")
case "$parent" in vd[a-z]|sd[a-z]|nvme[0-9]n[0-9]) ;; *) echo 'Unexpected root parent'; exit 1;; esac
disk_device="/dev/$parent"
serial=$(lsblk -dn -o SERIAL -- "$disk_device" | tr -d '[:space:]')
[ "$serial" = "$expected_serial" ] || { echo 'Root disk identity mismatch'; exit 1; }
bytes=$(sudo blockdev --getsize64 "$disk_device")
[ "$bytes" -eq "$expected_bytes" ] || { echo "Disk is not 200 GiB: $bytes"; exit 1; }
case "$root_fs" in ext4|xfs) ;; *) echo "Unsupported root filesystem: $root_fs"; exit 1;; esac
partition=$(cat "/sys/class/block/$(basename "$root_device")/partition")
[[ "$partition" =~ ^[0-9]+$ ]] || exit 1
command -v growpart >/dev/null
if [ "$root_fs" = ext4 ]; then command -v resize2fs >/dev/null; else command -v xfs_growfs >/dev/null; fi

echo 'Before:'
lsblk -b -o NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS,SERIAL "$disk_device"
df -B1 /
# growpart returns 1 for an already expanded partition. Fail on every other
# error; still resize the filesystem after NOCHANGE (a previous attempt may
# have expanded only the partition).
set +e
output=$(sudo growpart "$disk_device" "$partition" 2>&1)
result=$?
set -e
printf '%s\n' "$output"
if [ "$result" -ne 0 ]; then
  if [ "$result" -ne 1 ] || [[ "$output" != NOCHANGE:* ]]; then exit "$result"; fi
fi
if [ "$root_fs" = ext4 ]; then sudo resize2fs "$root_device"; else sudo xfs_growfs /; fi
echo 'After:'
lsblk -b -o NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS,SERIAL "$disk_device"
df -B1 /
available_size=$(df -B1 --output=size / | tail -1 | tr -d '[:space:]')
[ "$available_size" -gt 200000000000 ] || { echo 'Filesystem did not expand'; exit 1; }
curl -fsS --max-time 20 -A 'Mozilla/5.0 (disk resize check)' -o /dev/null -w 'app_status=%{http_code}\n' http://127.0.0.1:3000/
