#!/bin/sh
# OpenSSH forced command. The key has no shell, forwarding or PTY.
exec /usr/bin/sudo -n /usr/bin/python3 /usr/local/libexec/el-bot-dsh-deploy.py "${SSH_ORIGINAL_COMMAND-}"
