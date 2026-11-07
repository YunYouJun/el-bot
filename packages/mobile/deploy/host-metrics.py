#!/usr/bin/env python3
"""Sample Linux host resources without exposing a network service."""

import argparse
import datetime
import json
import os
from pathlib import Path
import socket
import tempfile
import time


def cpu_counters(contents):
    lines = contents.splitlines()
    values = [int(value) for value in lines[0].split()[1:9]]
    if not lines[0].startswith("cpu ") or len(values) != 8 or min(values) < 0:
        raise ValueError("Invalid CPU counters")
    # Guest time is already included in user/nice; count the first eight fields.
    count = sum(line.startswith("cpu") and line[3:4].isdigit() for line in lines)
    if count < 1:
        raise ValueError("Missing CPU count")
    return sum(values), values[3] + values[4], count


def cpu_usage(before, after):
    total = after[0] - before[0]
    idle = after[1] - before[1]
    if total <= 0 or idle < 0 or idle > total or before[2] != after[2]:
        raise ValueError("CPU counters changed unexpectedly")
    return round((total - idle) / total * 100, 1)


def memory_usage(contents):
    fields = {}
    for line in contents.splitlines():
        parts = line.split()
        if parts[0] in ("MemTotal:", "MemAvailable:") and parts[-1] == "kB":
            fields[parts[0][:-1]] = int(parts[1]) * 1024
    total = fields["MemTotal"]
    available = fields["MemAvailable"]
    if total <= 0 or available < 0 or available > total:
        raise ValueError("Invalid memory counters")
    used = total - available
    return dict(totalBytes=total, usedBytes=used, availableBytes=available,
                usagePercent=round(used / total * 100, 1))


def disk_usage(mount_point, stats):
    total = stats.f_blocks * stats.f_frsize
    used = (stats.f_blocks - stats.f_bfree) * stats.f_frsize
    available = stats.f_bavail * stats.f_frsize
    if total <= 0 or min(used, available) < 0 or used + available > total or used + available <= 0:
        raise ValueError("Invalid disk counters")
    # Match df: reserved filesystem blocks are excluded from available capacity.
    return dict(mountPoint=mount_point, totalBytes=total, usedBytes=used,
                availableBytes=available, usagePercent=round(used / (used + available) * 100, 1))


def collect(disks, sample_seconds=1):
    before = cpu_counters(Path("/proc/stat").read_text())
    started = time.monotonic()
    time.sleep(sample_seconds)
    after = cpu_counters(Path("/proc/stat").read_text())
    elapsed = time.monotonic() - started
    return dict(
        schemaVersion=1,
        sampledAt=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds"),
        hostname=socket.gethostname(),
        cpu=dict(count=after[2], usagePercent=cpu_usage(before, after), sampleSeconds=round(elapsed, 3)),
        memory=memory_usage(Path("/proc/meminfo").read_text()),
        disks=[disk_usage(path, os.statvfs(path)) for path in disks],
    )


def write_snapshot(destination, snapshot):
    # Replace inside the bind-mounted directory so readers never see partial JSON.
    destination = Path(destination)
    descriptor, temporary = tempfile.mkstemp(prefix=".snapshot-", dir=destination.parent)
    try:
        with os.fdopen(descriptor, "w") as output:
            json.dump(snapshot, output, separators=(",", ":"), allow_nan=False)
            output.flush()
            os.fchmod(output.fileno(), 0o644)
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="/var/lib/el-bot-host-metrics/host.json")
    parser.add_argument("--disk", action="append")
    arguments = parser.parse_args()
    write_snapshot(arguments.output, collect(arguments.disk or ["/"]))
