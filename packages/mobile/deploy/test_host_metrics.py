import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location("host_metrics", Path(__file__).with_name("host-metrics.py"))
metrics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metrics)


class HostMetricsTests(unittest.TestCase):
    def test_cpu_delta_does_not_double_count_guest_time(self):
        before = metrics.cpu_counters("cpu  10 0 10 70 10 0 0 0 100 100\ncpu0 1\ncpu1 1\n")
        after = metrics.cpu_counters("cpu  20 0 20 140 20 0 0 0 500 500\ncpu0 1\ncpu1 1\n")
        self.assertEqual(metrics.cpu_usage(before, after), 20)
        self.assertEqual(after[2], 2)
        with self.assertRaises(ValueError):
            metrics.cpu_usage(before, before)

    def test_memory_uses_available_instead_of_free(self):
        value = metrics.memory_usage("MemTotal: 1000 kB\nMemFree: 100 kB\nMemAvailable: 600 kB\n")
        self.assertEqual(value["usedBytes"], 400 * 1024)
        self.assertEqual(value["usagePercent"], 40)
        with self.assertRaises(KeyError):
            metrics.memory_usage("MemTotal: 1000 kB\nMemFree: 100 kB\n")

    def test_disk_percentage_matches_df_with_reserved_blocks(self):
        value = metrics.disk_usage("/", SimpleNamespace(f_blocks=100, f_bfree=60, f_bavail=50, f_frsize=1024))
        self.assertEqual(value["totalBytes"], 100 * 1024)
        self.assertEqual(value["usedBytes"], 40 * 1024)
        self.assertEqual(value["availableBytes"], 50 * 1024)
        self.assertEqual(value["usagePercent"], 44.4)

    def test_atomic_snapshot_replaces_the_same_directory_entry(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "host.json"
            for generation in [1, 2]:
                metrics.write_snapshot(path, {"generation": generation})
                self.assertEqual(json.loads(path.read_text()), {"generation": generation})
            self.assertEqual(path.stat().st_mode & 0o777, 0o644)
            self.assertEqual(list(Path(directory).iterdir()), [path])


if __name__ == "__main__":
    unittest.main()
