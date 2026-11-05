#!/usr/bin/env python3
"""Read-only prototype diagnostics. Match WebKit XPC helpers by resource coalition."""
import argparse
import ctypes as C
import json
import platform
import statistics
import subprocess
import time
from pathlib import Path


class Usage(C.Structure):
    _fields_ = [("uuid", C.c_uint8 * 16)] + [
        (name, C.c_uint64) for name in (
            "user", "system", "idle_wakeups", "interrupt_wakeups", "pageins",
            "wired", "resident", "footprint", "started", "exited",
            "child_user", "child_system", "child_idle", "child_interrupt",
            "child_pageins", "child_elapsed", "disk_read", "disk_write",
        )
    ]


lib = C.CDLL("/usr/lib/libproc.dylib", use_errno=True)
lib.proc_pidinfo.argtypes = [C.c_int, C.c_int, C.c_uint64, C.c_void_p, C.c_int]
lib.proc_pid_rusage.argtypes = [C.c_int, C.c_int, C.c_void_p]
lib.proc_listallpids.argtypes = [C.c_void_p, C.c_int]


class Timebase(C.Structure):
    _fields_ = [("numer", C.c_uint32), ("denom", C.c_uint32)]


timebase = Timebase()
C.CDLL("/usr/lib/libSystem.B.dylib").mach_timebase_info(C.byref(timebase))


def coalition(pid):
    # Diagnostic-only private flavor 20; ABI can change with macOS versions.
    ids = (C.c_uint64 * 16)()
    n = lib.proc_pidinfo(pid, 20, 0, C.byref(ids), C.sizeof(ids))
    if n < 16 or not ids[0]:
        raise RuntimeError(f"Cannot read resource coalition for PID {pid}")
    return ids[0]


def snapshot(groups):
    ids = (C.c_int * (lib.proc_listallpids(None, 0) + 512))()
    count = lib.proc_listallpids(C.byref(ids), C.sizeof(ids))
    result = {name: {} for name in groups}
    for pid in ids[:count]:
        try:
            group = coalition(pid)
        except RuntimeError:
            continue
        for name, target in groups.items():
            if target != group:
                continue
            u = Usage()
            if lib.proc_pid_rusage(pid, 2, C.byref(u)) != 0:
                continue
            result[name][str(pid)] = {"start": u.started, "cpuNs": (u.user + u.system) * timebase.numer // timebase.denom,
                                      "footprintBytes": u.footprint, "rssBytes": u.resident}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", action="append", required=True, help="NAME=PID; repeat per app")
    parser.add_argument("--seconds", type=int, default=30)
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--label", default="closed")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    roots = {name: int(pid) for name, pid in (item.split("=", 1) for item in args.pid)}
    groups = {name: coalition(pid) for name, pid in roots.items()}
    if len(set(groups.values())) != len(groups):
        raise RuntimeError("Apps share a coalition; independent launch is required")
    output = {"platform": platform.platform(), "label": args.label, "roots": roots,
              "coalitions": groups, "machTimebase": [timebase.numer, timebase.denom],
              "secondsPerRound": args.seconds, "rounds": []}
    for _ in range(args.rounds):
        start = snapshot(groups)
        before = start
        start_time = previous_time = time.monotonic_ns()
        cpu = dict.fromkeys(groups, 0)
        samples = []
        for _ in range(args.seconds):
            time.sleep(1)
            after = snapshot(groups)
            now = time.monotonic_ns()
            sample = {"elapsedSeconds": (now - previous_time) / 1e9, "apps": {}}
            for name in groups:
                delta = 0
                for pid, u in after[name].items():
                    prev = before[name].get(pid)
                    if prev and prev["start"] == u["start"]:
                        delta += max(0, u["cpuNs"] - prev["cpuNs"])
                    # Newly spawned processes count their full lifetime CPU.
                    elif pid not in start[name]:
                        delta += u["cpuNs"]
                cpu[name] += delta
                sample["apps"][name] = {
                    "footprintMiB": sum(u["footprintBytes"] for u in after[name].values()) / 1048576,
                    "cpuPercent": delta / (now - previous_time) * 100,
                    "processes": after[name],
                }
            samples.append(sample)
            before, previous_time = after, now
        elapsed = (previous_time - start_time) / 1e9
        summary = {name: {
            "footprintMedianMiB": statistics.median(s["apps"][name]["footprintMiB"] for s in samples),
            "footprintRangeMiB": [min(s["apps"][name]["footprintMiB"] for s in samples), max(s["apps"][name]["footprintMiB"] for s in samples)],
            "cpuPercent": cpu[name] / (elapsed * 1e9) * 100,
            "processCount": len(before[name]),
        } for name in groups}
        output["rounds"].append({"elapsedSeconds": elapsed, "summary": summary, "samples": samples})
        args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(summary), flush=True)
    # Process names only, never command-line arguments or credentials.
    output["processNames"] = subprocess.check_output(
        ["/bin/ps", "-p", ",".join(pid for app in before.values() for pid in app), "-o", "pid=,comm="], text=True
    ).strip().splitlines()
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
