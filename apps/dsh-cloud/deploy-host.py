#!/usr/bin/env python3
"""Install as root-owned /usr/local/libexec/el-bot-dsh-deploy.py on the Docker host."""

import fcntl
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path('/srv/yunlefun/el-bot-dsh')
MANAGED = ROOT / 'deploy'
RELEASES = MANAGED / 'releases'
CONTROL = MANAGED / 'control'
HOLD = CONTROL / 'hold'
CONFIG = MANAGED / 'baseline.json'
STATE = MANAGED / 'state.json'
OVERRIDE = MANAGED / 'compose.release.json'
CONTAINER = 'el-bot-dsh'
CODE = '/opt/el-bot-dsh'
CONTROL_TARGET = '/run/el-bot-dsh-deploy'
SHA = re.compile(r'[a-f0-9]{64}')
SMOKES = ('qq-smoke.mjs', 'group-chat-smoke.mjs')
REQUIRED = {'dsh/package.json', 'dsh/cordis.patch.yml', 'dsh/dist/qq.mjs',
            'dsh/dist/index.mjs', 'dsh/dist/qq-workspaces.mjs', 'dsh/dist/client.js',
            'dsh/dist/web/index.html', *SMOKES}
INPUT_LIMIT = 12 * 1024 * 1024
GATE_CLIENT = """
const net = require('node:net')
const path = require('node:path')
const s = net.createConnection(path.join(process.env.HOME, '.dsh/profiles/cloud/el-bot-qq/deploy.sock'))
s.on('connect', () => s.write(process.argv[1] + '\\n'))
s.on('data', data => process.stdout.write(data))
s.on('error', () => { process.exitCode = 1 })
s.setTimeout(7000, () => { process.exitCode = 1; s.destroy() })
"""


class DeployError(Exception):
    pass


def run(*args, timeout=20):
    try:
        return subprocess.run(args, cwd=ROOT, check=True, capture_output=True, text=True, timeout=timeout).stdout
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise DeployError(f'{args[0]} {args[1]} failed') from error


def write_json(path, data):
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as handle:
        pending = Path(handle.name)
        try:
            json.dump(data, handle)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
            os.replace(pending, path)
        finally:
            pending.unlink(missing_ok=True)


def read_json(path):
    return json.loads(path.read_text())


def inspect():
    return json.loads(run('docker', 'inspect', CONTAINER))[0]


def mounts(container):
    return {m['Destination']: [m['Type'], m['Source'], m['RW']] for m in container['Mounts']}


def compose(base, *args, override=None, timeout=30):
    files = base['files'] + ([str(override)] if override else [])
    flags = [item for path in files for item in ('-f', path)]
    return run('docker', 'compose', '--project-directory', str(ROOT), '-p', base['project'], *flags, *args, timeout=timeout)


def init():
    if CONFIG.exists():
        raise DeployError('deployment is already initialized')
    current = inspect()
    labels = current['Config']['Labels']
    files = labels['com.docker.compose.project.config_files'].split(',')
    current_mounts = mounts(current)
    code_mount = current_mounts.pop(CODE)
    if (labels['com.docker.compose.project.working_dir'] != str(ROOT)
            or labels['com.docker.compose.service'] != 'dsh'
            or labels['com.docker.compose.project'] != CONTAINER
            or code_mount[0] != 'bind' or code_mount[2]
            or not all(Path(p).resolve().parent == ROOT and Path(p).is_file() for p in files)):
        raise DeployError('unexpected existing Compose project')
    base = {'project': CONTAINER, 'files': files, 'image': current['Image'],
            'mounts': current_mounts, 'baselineCode': code_mount[1]}
    service = json.loads(compose(base, 'config', '--format', 'json'))['services']['dsh']
    if run('docker', 'image', 'inspect', '-f', '{{.Id}}', service['image']).strip() != base['image']:
        raise DeployError('Compose references a different runtime image')
    MANAGED.mkdir(mode=0o700, exist_ok=True)
    RELEASES.mkdir(mode=0o700, exist_ok=True)
    CONTROL.mkdir(mode=0o755, exist_ok=True)
    CONTROL.chmod(0o755)
    write_json(STATE, {'active': 'baseline', 'previous': None, 'result': 'initialized'})
    write_json(CONFIG, base)
    print('Initialized against the existing Compose project and data mounts.')


def gate(command):
    try:
        return json.loads(run('docker', 'exec', '--user', 'node', CONTAINER, 'node', '-e', GATE_CLIENT, command))['state']
    except (DeployError, ValueError, KeyError):
        return 'unavailable'


def validated_members(archive):
    seen = set()
    total = 0
    for item in archive:
        path = PurePosixPath(item.name)
        if (item.name != str(path) or '..' in path.parts or path.is_absolute()
                or item.name in seen or len(seen) >= 5000
                or not re.fullmatch(r'[\w./-]+', item.name, flags=re.ASCII)
                or not (item.isfile() or item.isdir())
                or not (item.name in REQUIRED or item.name in {'dsh', 'dsh/dist'}
                        or item.name.startswith('dsh/dist/'))):
            raise DeployError('invalid release archive entry')
        seen.add(item.name)
        total += item.size
        if total > 48 * 1024 * 1024:
            raise DeployError('release archive exceeds unpacked size limit')
        yield item
    if not REQUIRED.issubset(seen):
        raise DeployError('incomplete release archive')


def read_archive(release, stream):
    data = stream.read(INPUT_LIMIT + 1)
    if len(data) > INPUT_LIMIT or hashlib.sha256(data).hexdigest() != release:
        raise DeployError('release checksum or size did not match')
    return data


def stage(release, stream):
    data = read_archive(release, stream)
    target = RELEASES / release
    if target.exists():
        return target
    with tempfile.TemporaryDirectory(prefix='.incoming-', dir=RELEASES) as tmp:
        work = Path(tmp) / 'payload'
        work.mkdir(mode=0o755)
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            for item in validated_members(archive):
                path = work / item.name
                if item.isdir():
                    path.mkdir(mode=0o755, parents=True, exist_ok=True)
                else:
                    path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
                    with path.open('xb') as output:
                        output.write(archive.extractfile(item).read())
                    path.chmod(0o644)
        for folder in [work, *(p for p in work.rglob('*') if p.is_dir())]:
            folder.chmod(0o755)
        if not all((work / name).is_file() for name in REQUIRED):
            raise DeployError('incomplete release files')
        work.rename(target)
    return target


def smoke(base, release):
    payload = RELEASES / release
    for name in SMOKES:
        run('docker', 'run', '--rm', '--network', 'none', '--user', 'node', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges:true', '--entrypoint', 'node',
            '--mount', f'type=bind,src={payload / "dsh"},dst={CODE},readonly',
            '--mount', f'type=bind,src={payload / name},dst=/tmp/{name},readonly',
            base['image'], f'/tmp/{name}', timeout=90)


def compose_override(path, base, release):
    source = base['baselineCode'] if release == 'baseline' else str(RELEASES / release / 'dsh')
    write_json(path, {'services': {'dsh': {
        'labels': {'org.el-bot.dsh.release': release},
        'volumes': [
            {'type': 'bind', 'source': source, 'target': CODE, 'read_only': True, 'bind': {'create_host_path': False}},
            {'type': 'bind', 'source': str(CONTROL), 'target': CONTROL_TARGET,
             'read_only': True, 'bind': {'create_host_path': False}},
        ],
    }}})


def expected_mounts(base, release):
    source = base['baselineCode'] if release == 'baseline' else str(RELEASES / release / 'dsh')
    return {**base['mounts'], CODE: ['bind', source, False], CONTROL_TARGET: ['bind', str(CONTROL), False]}


def validate_compose(base, release, path):
    service = json.loads(compose(base, 'config', '--format', 'json', override=path))['services']['dsh']
    planned = {item['target']: [item['type'], item['source'], not item.get('read_only', False)]
               for item in service['volumes']}
    if service['container_name'] != CONTAINER or planned != expected_mounts(base, release):
        raise DeployError('candidate changes unrelated mounts or container identity')
    if run('docker', 'image', 'inspect', '-f', '{{.Id}}', service['image']).strip() != base['image']:
        raise DeployError('candidate changes the runtime image')


def verify(base, release, old_id):
    current = inspect()
    if (current['Id'] == old_id or current['Image'] != base['image']
            or current['Config']['Labels'].get('org.el-bot.dsh.release') != release
            or mounts(current) != expected_mounts(base, release)
            or current['State'].get('Health', {}).get('Status') != 'healthy'
            or gate('status') != 'ready'):
        raise DeployError('new container did not pass release and health checks')


def start(base, release, old_id):
    validate_compose(base, release, OVERRIDE)
    compose(base, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never',
            '--wait', '--wait-timeout', '150', 'dsh', override=OVERRIDE, timeout=200)
    verify(base, release, old_id)


def switch(base, state, target):
    current = inspect()
    if current['State'].get('Health', {}).get('Status') != 'healthy':
        raise DeployError('existing container is not healthy')
    previous = state['active']
    if target == previous:
        return {'active': previous, 'result': 'already-current'}
    if target != 'baseline':
        smoke(base, target)
    with tempfile.TemporaryDirectory(dir=MANAGED) as tmp:
        proposed = Path(tmp) / 'release.json'
        compose_override(proposed, base, target)
        validate_compose(base, target, proposed)
        admission = gate('prepare')
        if admission != 'prepared':
            return {'active': previous, 'result': 'busy' if admission == 'busy' else 'gate-unavailable'}
        rollback_ok = True
        try:
            HOLD.touch(mode=0o644)
            HOLD.chmod(0o644)
            compose_override(OVERRIDE, base, target)
            write_json(STATE, {**state, 'pending': target, 'result': 'switching'})
            try:
                start(base, target, current['Id'])
            except (DeployError, ValueError, OSError, KeyError) as error:
                rollback_ok = False
                compose_override(OVERRIDE, base, previous)
                try:
                    if inspect()['Id'] == current['Id']:
                        # The candidate never replaced the healthy previous container.
                        if inspect()['State'].get('Health', {}).get('Status') != 'healthy':
                            raise DeployError('the original container is no longer healthy')
                    else:
                        start(base, previous, inspect()['Id'])
                    rollback_ok = True
                finally:
                    write_json(STATE, {**state, 'result': 'rolled-back' if rollback_ok else 'rollback-failed'})
                return {'active': previous, 'result': 'rolled-back', 'reason': str(error)}
            new = {'active': target, 'previous': previous, 'result': 'deployed'}
            write_json(STATE, new)
            return new
        finally:
            if rollback_ok:
                HOLD.unlink(missing_ok=True)
                gate('release')


def host_mountpoints():
    # Linux mountinfo also identifies same-filesystem bind mounts, which is_mount() can miss.
    with Path('/proc/self/mountinfo').open() as handle:
        for line in handle:
            encoded = line.split()[4]
            yield Path(re.sub(r'\\([0-7]{3})', lambda m: chr(int(m[1], 8)), encoded))


def prune(base, state):
    """Remove only old, complete artifacts in the managed release directory."""
    active, previous = state['active'], state['previous']
    retained = {active, previous} - {None, 'baseline'}
    if any(not isinstance(item, str) or not SHA.fullmatch(item) for item in retained):
        raise DeployError('release retention state is invalid')
    verify(base, active, None)
    root = RELEASES.resolve(strict=True)
    if RELEASES.is_symlink() or root.parent != MANAGED.resolve(strict=True):
        raise DeployError('managed release directory is not a direct child')
    # Protect the initial code, rollback artifacts, and every configured data mount.
    protected = [Path(base['baselineCode']).resolve(), *(root / item for item in retained)]
    protected.extend(Path(source).resolve() for _, source, _ in base['mounts'].values())
    for item in retained:
        if (root / item).is_symlink() or not all((root / item / name).is_file() for name in REQUIRED):
            raise DeployError('a retained release is unavailable')
    mountpoints = [path for path in map(Path.resolve, host_mountpoints()) if path.is_relative_to(root)]
    removed = []
    for entry in sorted(root.iterdir()):
        if (not SHA.fullmatch(entry.name) or entry.name in retained or entry.is_symlink()
                or not entry.is_dir() or entry.is_mount()
                or any(path.is_relative_to(entry) for path in mountpoints)
                or any(path.is_relative_to(entry) or entry.is_relative_to(path) for path in protected)
                or not all((entry / name).is_file() for name in REQUIRED)):
            continue
        shutil.rmtree(entry)
        removed.append(entry.name)
    return removed


def lock():
    handle = (MANAGED / 'deploy.lock').open('a')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return handle
    except BlockingIOError as error:
        handle.close()
        raise DeployError('another deployment is running') from error


def apply(target, job):
    result_file = MANAGED / f'job-{job}.json'
    upload = MANAGED / f'job-{job}.tar.gz'
    try:
        with lock():
            state = read_json(STATE)
            if 'pending' in state or state['result'] == 'rollback-failed':
                raise DeployError('previous deployment requires recovery')
            if target == 'previous':
                target = state.get('previous')
                if not target:
                    raise DeployError('no previous release')
            else:
                # The upload is outside RELEASES until this job owns the deployment lock.
                with upload.open('rb') as stream:
                    stage(target, stream)
            base = read_json(CONFIG)
            result = switch(base, state, target)
            if result['result'] in {'deployed', 'already-current'}:
                current = read_json(STATE)
                try:
                    cleanup = {'removed': prune(base, current)}
                except (DeployError, OSError, ValueError, KeyError, TypeError) as error:
                    cleanup = {'warning': str(error) if isinstance(error, DeployError) else 'release cleanup failed'}
                result['cleanup'] = cleanup
                write_json(STATE, {**current, 'cleanup': cleanup})
    except (DeployError, OSError, ValueError, KeyError, tarfile.TarError) as error:
        result = {'result': 'failed', 'reason': str(error) if isinstance(error, DeployError) else 'internal error'}
    finally:
        upload.unlink(missing_ok=True)
    write_json(result_file, result)


def bootstrap(release):
    """Install only the deployment socket on a pre-gate container; the operator restarts it safely once."""
    with lock():
        base = read_json(CONFIG)
        if read_json(STATE)['active'] != 'baseline' or gate('status') == 'ready':
            raise DeployError('deployment gate is already installed')
        source = RELEASES / release / 'dsh/dist'
        live = Path(base['baselineCode']) / 'dist'
        candidate = source / 'qq.mjs'
        files = re.findall(r'["\']\./([a-zA-Z0-9_.*-]+\.mjs)["\']', candidate.read_text())
        for name in set(files):
            if not (live / name).is_file() or (live / name).read_bytes() != (source / name).read_bytes():
                raise DeployError('bootstrap changes a shared bundle chunk')
        smoke(base, release)
        backup = MANAGED / 'qq.mjs.before-bootstrap'
        if backup.exists():
            raise DeployError('bootstrap backup already exists')
        backup.write_bytes((live / 'qq.mjs').read_bytes())
        with tempfile.NamedTemporaryFile(dir=live, delete=False) as file:
            pending = Path(file.name)
            try:
                file.write(candidate.read_bytes())
                file.flush()
                os.fsync(file.fileno())
                pending.chmod(0o644)
                os.replace(pending, live / 'qq.mjs')
            finally:
                pending.unlink(missing_ok=True)
        print('Deployment gate installed on disk. Restart the existing bot safely once.')


def main():
    os.umask(0o077)
    if os.geteuid() != 0:
        raise DeployError('run as root')
    args = sys.argv[1:]
    if args == ['--init']:
        init()
        return 0
    if len(args) == 2 and args[0] == '--bootstrap' and SHA.fullmatch(args[1]):
        bootstrap(args[1])
        return 0
    if len(args) == 3 and args[0] == '--apply' and (args[1] == 'previous' or SHA.fullmatch(args[1])) and re.fullmatch('[a-f0-9]{24}', args[2]):
        apply(args[1], args[2])
        return 0
    command = args[0].split() if len(args) == 1 and len(args[0]) <= 80 else []
    if command == ['status']:
        current = inspect()
        print(json.dumps({**read_json(STATE), 'health': current['State'].get('Health', {}).get('Status'),
                          'startedAt': current['State']['StartedAt'], 'gate': gate('status')}))
        return 0
    job = secrets.token_hex(12)
    if command == ['rollback']:
        target = 'previous'
    elif len(command) == 2 and command[0] in {'deploy', 'stage'} and SHA.fullmatch(command[1]):
        target = command[1]
        if command[0] == 'stage':
            with lock():
                stage(target, sys.stdin.buffer)
            print(f'Staged {target}')
            return 0
        data = read_archive(target, sys.stdin.buffer)
        with (MANAGED / f'job-{job}.tar.gz').open('xb') as handle:
            handle.write(data)
    else:
        raise DeployError('allowed commands: status, deploy SHA256, stage SHA256, rollback')
    run('systemd-run', '--quiet', '--wait', '--collect', '--unit', f'el-bot-dsh-release-{job}',
        '--property=RuntimeMaxSec=600', '/usr/bin/python3', str(Path(__file__).resolve()),
        '--apply', target, job, timeout=620)
    path = MANAGED / f'job-{job}.json'
    result = read_json(path)
    path.unlink()
    print(json.dumps(result))
    return {'deployed': 0, 'already-current': 0, 'busy': 75, 'gate-unavailable': 69, 'rolled-back': 1}.get(result['result'], 1)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (DeployError, OSError, ValueError, KeyError, tarfile.TarError) as error:
        print(str(error) if isinstance(error, DeployError) else 'Deployment command failed', file=sys.stderr)
        sys.exit(1)
