import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy_host', Path(__file__).with_name('deploy-host.py'))
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class DeployTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.state = {'active': 'old', 'previous': None, 'result': 'deployed'}
        self.base = {'baselineCode': str(root / 'baseline'), 'mounts': {'/home/node': ['bind', '/persistent-home', True]}}
        self.container = {'Id': 'old-id', 'State': {'Health': {'Status': 'healthy'}}}
        self.context = patch.multiple(
            host, MANAGED=root, RELEASES=root / 'releases', HOLD=root / 'hold',
            STATE=root / 'state.json', OVERRIDE=root / 'compose.release.json', CONFIG=root / 'baseline.json',
        )
        self.context.start()
        self.addCleanup(self.context.stop)

    def test_busy_is_not_a_cutover(self):
        with (patch.object(host, 'inspect', return_value=self.container),
              patch.object(host, 'gate', return_value='busy'),
              patch.object(host, 'smoke'), patch.object(host, 'validate_compose'),
              patch.object(host, 'start') as start):
            self.assertEqual(host.switch(self.base, self.state, 'new')['result'], 'busy')
            start.assert_not_called()
        self.assertFalse(host.OVERRIDE.exists())
        self.assertFalse(host.HOLD.exists())

    def test_unhealthy_candidate_restores_previous_release_with_data_mount_unchanged(self):
        candidate = {**self.container, 'Id': 'new-id'}
        calls = []

        def start(base, release, old_id):
            self.assertTrue(host.HOLD.is_file())
            self.assertEqual(host.expected_mounts(base, release)['/home/node'], ['bind', '/persistent-home', True])
            calls.append((release, old_id))
            if release == 'new':
                raise host.DeployError('candidate unhealthy')

        with (patch.object(host, 'inspect', side_effect=[self.container, candidate, candidate]),
              patch.object(host, 'gate', return_value='prepared'),
              patch.object(host, 'smoke'), patch.object(host, 'validate_compose'),
              patch.object(host, 'start', side_effect=start)):
            result = host.switch(self.base, self.state, 'new')
        self.assertEqual(result['result'], 'rolled-back')
        self.assertEqual(calls, [('new', 'old-id'), ('old', 'new-id')])
        self.assertEqual(json.loads(host.STATE.read_text())['active'], 'old')
        self.assertFalse(host.HOLD.exists())

    def release(self, digest):
        release = host.RELEASES / digest
        for name in host.REQUIRED:
            file = release / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text('code fixture')
        return release

    def test_retention_keeps_current_previous_baseline_and_data(self):
        active, previous, older, initial, mounted, linked = [digit * 64 for digit in 'abcdef']
        keep = [self.release(item) for item in (active, previous, initial, mounted)]
        old = self.release(older)
        base = {**self.base, 'baselineCode': str(keep[2] / 'dsh')}
        outside = host.MANAGED / 'chat.json'
        outside.write_text('chat and permissions')
        link = host.RELEASES / linked
        link.symlink_to(keep[2], target_is_directory=True)
        unknown = host.RELEASES / ('0' * 64)
        unknown.mkdir()
        with (patch.object(host, 'verify') as verify,
              patch.object(host, 'host_mountpoints', return_value=[keep[3] / 'dsh' / 'dist'])):
            removed = host.prune(base, {'active': active, 'previous': previous})
        verify.assert_called_once_with(base, active, None)
        self.assertEqual(removed, [older])
        self.assertFalse(old.exists())
        self.assertTrue(all(path.is_dir() for path in keep))
        self.assertTrue(link.is_symlink())
        self.assertTrue(unknown.is_dir())
        self.assertEqual(outside.read_text(), 'chat and permissions')

    def test_does_not_prune_when_health_verification_fails(self):
        old = self.release('a' * 64)
        with patch.object(host, 'verify', side_effect=host.DeployError('unhealthy')):
            with self.assertRaises(host.DeployError):
                host.prune(self.base, {'active': 'b' * 64, 'previous': None})
        self.assertTrue(old.is_dir())

    def test_apply_only_prunes_after_success_and_removes_its_own_upload(self):
        target, job = 'a' * 64, 'b' * 24
        host.write_json(host.CONFIG, self.base)
        host.write_json(host.STATE, self.state)
        upload = host.MANAGED / f'job-{job}.tar.gz'
        for outcome in ('busy', 'rolled-back', 'deployed', 'already-current'):
            with self.subTest(outcome=outcome):
                upload.write_bytes(b'test upload')
                with (patch.object(host, 'stage') as stage,
                      patch.object(host, 'switch', return_value={'result': outcome}),
                      patch.object(host, 'prune', return_value=['c' * 64]) as prune):
                    host.apply(target, job)
                self.assertEqual(stage.call_count, 1)
                self.assertFalse(upload.exists())
                result = host.read_json(host.MANAGED / f'job-{job}.json')
                if outcome in ('deployed', 'already-current'):
                    prune.assert_called_once()
                    self.assertEqual(result['cleanup']['removed'], ['c' * 64])
                else:
                    prune.assert_not_called()
                    self.assertNotIn('cleanup', result)

    def test_rejects_link_entries_from_uploaded_artifact(self):
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode='w:gz') as archive:
            link = tarfile.TarInfo('dsh/dist/qq.mjs')
            link.type = tarfile.SYMTYPE
            link.linkname = '/etc/passwd'
            archive.addfile(link)
        buffer.seek(0)
        with tarfile.open(fileobj=buffer, mode='r:gz') as archive:
            with self.assertRaises(host.DeployError):
                list(host.validated_members(archive))


if __name__ == '__main__':
    unittest.main()
