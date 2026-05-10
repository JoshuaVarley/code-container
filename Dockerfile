# Code Container
# Generic Dockerfile for running coding tools in isolated project environments

FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Mark the container as a sandbox so Claude Code (and other harnesses with similar
# checks) will accept permissive modes while running as root.
ENV IS_SANDBOX=1

# Set timezone to America/New_York (EST)
ENV TZ=America/New_York
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install system dependencies and common build tools
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    curl \
    wget \
    unzip \
    xz-utils \
    ca-certificates \
    libssl-dev \
    libicu-dev \
    zlib1g-dev \
    libffi-dev \
    vim \
    tree

# Install NVM (Node Version Manager) and Node.js
ENV NVM_DIR=/root/.nvm
ENV NODE_VERSION=22
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash \
    && . "$NVM_DIR/nvm.sh" \
    && nvm install ${NODE_VERSION} \
    && nvm use ${NODE_VERSION} \
    && nvm alias default ${NODE_VERSION} \
    && ln -sf "$NVM_DIR/versions/node/$(nvm current)/bin/"* /usr/local/bin/

RUN apt-get update \
    && apt-get install -y \
        python3 \
        python3-dev \
        python3-venv \
        python3-pip

# Create python symlink pointing to python3
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Install Claude Code globally via official installer.
# The installer places the versioned binary directly at
# ~/.local/share/claude/versions/<X.Y.Z> (a flat file named after the version,
# not a directory) with a symlink at ~/.local/bin/claude pointing to it. At
# runtime the core mount overlays /root/.local/share from the host, which
# shadows that binary and leaves the symlink dangling — Claude detects this on
# startup and refuses to run. So we snapshot the install dir to
# /opt/claude-template and the entrypoint re-seeds it into the host mount on
# first start (same pattern as cargo/rustup/zvm). /root/.local/bin is NOT
# mounted, so the symlink itself survives unmodified across rebuilds.
RUN curl -fsSL https://claude.ai/install.sh | bash \
    && CLAUDE_BIN="$(readlink -f /root/.local/bin/claude)" \
    && [ -x "$CLAUDE_BIN" ] || { echo "claude binary not found after install" >&2; exit 1; } \
    && cp -a /root/.local/share/claude /opt/claude-template
RUN echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc

# Install Opencode
RUN npm install -g opencode-ai

# Install OpenAI Codex CLI
RUN npm install -g @openai/codex

# Install Gemini CLI
RUN npm install -g @google/gemini-cli

# Install GitHub Copilot CLI
RUN npm install -g @github/copilot

# Install .NET 10 SDK via the official dotnet-install script (arch-agnostic, works on x64 and arm64)
ENV DOTNET_ROOT=/usr/share/dotnet
RUN curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \
    && chmod +x /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --channel 10.0 --install-dir "$DOTNET_ROOT" \
    && ln -sf "$DOTNET_ROOT/dotnet" /usr/local/bin/dotnet \
    && rm /tmp/dotnet-install.sh
ENV PATH="${DOTNET_ROOT}:${DOTNET_ROOT}/tools:${PATH}"

# Install the .NET Aspire CLI as a dotnet global tool. Lands in
# $DOTNET_ROOT/tools, which is already on PATH (see ENV above).
RUN dotnet tool install Aspire.Cli --tool-path "${DOTNET_ROOT}/tools"

# Install Rust via rustup, with the stable toolchain and the rust-analyzer
# component (so editors/LSPs pick it up via `rustup which rust-analyzer`).
# As with zvm, we bind-mount $CARGO_HOME (/root/.cargo) and $RUSTUP_HOME
# (/root/.rustup) from the host at runtime so toolchains, the registry cache,
# and `cargo install`-ed binaries persist across container recreations. The
# entrypoint re-seeds empty mounts from /opt/cargo-template and
# /opt/rustup-template on first start.
ENV CARGO_HOME=/root/.cargo
ENV RUSTUP_HOME=/root/.rustup
ENV PATH="${CARGO_HOME}/bin:${PATH}"
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain stable --component rust-analyzer \
    && cp -a /root/.cargo /opt/cargo-template \
    && cp -a /root/.rustup /opt/rustup-template \
    && echo 'export CARGO_HOME="$HOME/.cargo"' >> /root/.bashrc \
    && echo 'export RUSTUP_HOME="$HOME/.rustup"' >> /root/.bashrc \
    && echo 'export PATH="$CARGO_HOME/bin:$PATH"' >> /root/.bashrc

# Install zvm (Zig Version Manager — https://github.com/tristanisham/zvm).
# Users pick a Zig/ZLS version at runtime inside the container, e.g.:
#   zvm i master              # install Zig master
#   zvm i --zls master        # install the matching ZLS
#   zvm i 0.13.0              # install a specific tagged release
#   zvm use 0.13.0            # switch the active version
# Active zig/zls are symlinked into $ZVM_PATH/bin, the zvm binary itself
# lives in $ZVM_PATH/self — both are added to PATH below.
#
# zvm installs each Zig version directly under $ZVM_PATH/<version>/ (NOT under
# a 'versions' subdir), so to persist installs across container recreations we
# bind-mount the entire $ZVM_PATH from the host. That mount shadows whatever
# we put here at build time, so we also stash a copy at /opt/zvm-template/ —
# the entrypoint script (added at the end of this Dockerfile) re-seeds an
# empty mount from that template on first start.
ENV ZVM_PATH=/root/.zvm
ENV PATH="${ZVM_PATH}/bin:${ZVM_PATH}/self:${PATH}"
RUN curl -fsSL https://raw.githubusercontent.com/tristanisham/zvm/master/install.sh | bash \
    && echo 'export ZVM_PATH="$HOME/.zvm"' >> /root/.bashrc \
    && echo 'export PATH="$ZVM_PATH/bin:$ZVM_PATH/self:$PATH"' >> /root/.bashrc \
    && cp -a /root/.zvm /opt/zvm-template

# Set working directory to root home
WORKDIR /root

# Configure bash prompt to show container name
RUN echo 'PS1="\[\033[01;32m\][code-container]\[\033[00m\] \[\033[01;34m\]\w\[\033[00m\]\$ "' >> /root/.bashrc

# Source NVM in bashrc for interactive shells
RUN echo 'export NVM_DIR="$HOME/.nvm"' >> /root/.bashrc \
    && echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> /root/.bashrc \
    && echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> /root/.bashrc

# Entrypoint: re-seed bind-mounted toolchain home dirs (/root/.zvm,
# /root/.cargo, /root/.rustup, /root/.local/share/claude) from their
# /opt/*-template snapshots when the host mount is empty (first run) or has
# been wiped. seed_if_empty checks a sentinel path inside the target — if the
# sentinel is present, the user already has a working install, so we skip and
# leave their state alone. seed_merge unconditionally fills in missing files;
# we use it for claude because each container build ships a specific versioned
# binary and the build-time symlink at /root/.local/bin/claude (which lives in
# the container layer, not the mount) points to that exact version — so we
# always need that version's binary present, even if the host already has
# other versions from prior containers. `cp -an` (archive, no-clobber) never
# overwrites a user-changed file in either mode. We avoid heredocs to keep
# BuildKit optional (Podman + buildx-in-container is a known pain point).
RUN printf '%s\n' \
    '#!/bin/bash' \
    'set -e' \
    'seed_if_empty() {' \
    '  local template="$1" target="$2" sentinel="$3"' \
    '  if [ ! -e "$target/$sentinel" ] && [ -d "$template" ]; then' \
    '    mkdir -p "$target"' \
    '    cp -an "$template/." "$target/"' \
    '  fi' \
    '}' \
    'seed_merge() {' \
    '  local template="$1" target="$2"' \
    '  if [ -d "$template" ]; then' \
    '    mkdir -p "$target"' \
    '    cp -an "$template/." "$target/"' \
    '  fi' \
    '}' \
    'seed_if_empty /opt/zvm-template    /root/.zvm    self/zvm' \
    'seed_if_empty /opt/cargo-template  /root/.cargo  bin/cargo' \
    'seed_if_empty /opt/rustup-template /root/.rustup settings.toml' \
    'seed_merge    /opt/claude-template /root/.local/share/claude' \
    'exec "$@"' \
    > /usr/local/bin/code-container-entrypoint \
    && chmod +x /usr/local/bin/code-container-entrypoint

ENTRYPOINT ["/usr/local/bin/code-container-entrypoint"]

# Default command: bash shell
CMD ["/bin/bash"]
