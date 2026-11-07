FROM node:24-bookworm-slim@sha256:6042915a8b58012e6699f998ed96bca43ec9d8582447bdb68bc2445d0fafeb79

WORKDIR /opt/dsh-runtime
# npm auto-installs the QQ plugin's older prerelease peers at the installation
# root. Align those peers with the host instead of exempting its version guard.
RUN node -e 'const fs=require("node:fs");const p={private:true,dependencies:{"@deepseek-ai/dsh":"0.2.2-rc.1","@tencent-connect/dsh-qqbot":"0.5.5","@tencent-connect/qqbot-nodejs":"1.0.5"},overrides:Object.fromEntries(["dsh-agent","dsh-llm","dsh-session","dsh-system-prompt","dsh-user-approval"].map(n=>["@deepseek-ai/"+n,"0.2.2-rc.1"]))};fs.writeFileSync("package.json",JSON.stringify(p))' \
    && npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force
# Bootstrap HTTPS with Node's bundled Mozilla roots before installing Debian's CA bundle.
ARG DEBIAN_MIRROR=https://deb.debian.org
RUN node -e 'const fs=require("node:fs");fs.mkdirSync("/etc/ssl/certs",{recursive:true});fs.writeFileSync("/etc/ssl/certs/ca-certificates.crt",require("node:tls").rootCertificates.join("\n"))' \
    && sed -i "s|http://deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=2 -o Acquire::https::Timeout=30 update \
    && apt-get -o Acquire::Retries=2 -o Acquire::https::Timeout=30 install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY dsh/ /opt/el-bot-dsh/
RUN chmod -R a+rX /opt/el-bot-dsh \
    && mkdir -p /opt/dsh-runtime/node_modules/@el-bot \
    && ln -s /opt/el-bot-dsh /opt/dsh-runtime/node_modules/@el-bot/dsh
COPY --chmod=0644 entrypoint.sh /opt/dsh-runtime/entrypoint.sh
COPY --chmod=0644 cutover.mjs /opt/dsh-runtime/cutover.mjs
COPY --chmod=0644 health.mjs healthcheck.mjs history.mjs security-smoke.mjs /opt/dsh-runtime/
COPY --chmod=0644 tool-runtime.mjs tool-runtime-smoke.mjs /opt/dsh-runtime/
COPY --chmod=0644 session-management-smoke.mjs group-chat-smoke.mjs /opt/dsh-runtime/
RUN mkdir -p /opt/dsh-qq-workspaces && chmod 0755 /opt/dsh-qq-workspaces /opt/dsh-runtime /opt/el-bot-dsh

ENV NODE_ENV=production
USER node
EXPOSE 3080
ENTRYPOINT ["/bin/sh", "/opt/dsh-runtime/entrypoint.sh"]
