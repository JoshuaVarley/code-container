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
# The installer places the binary at ~/.claude/local/<ver>/claude with a symlink at
# ~/.local/bin/claude. At runtime the core mount overlays /root/.claude from the host,
# which would hide that binary and break the symlink — so we resolve and copy the
# real binary to /usr/local/bin/claude where the mount can't shadow it.
RUN curl -fsSL https://claude.ai/install.sh | bash \
    && CLAUDE_BIN="$(readlink -f /root/.local/bin/claude)" \
    && [ -x "$CLAUDE_BIN" ] || { echo "claude binary not found after install" >&2; exit 1; } \
    && install -m 0755 "$CLAUDE_BIN" /usr/local/bin/claude
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

# Install the .NET Aspire CLI directly into /usr/local/bin so it's on PATH for every
# shell (interactive or not) without relying on bashrc. The installer's default of
# ~/.aspire/bin would otherwise need shell-rc PATH setup.
RUN curl -sSL https://aspire.dev/install.sh | bash -s -- --install-path /usr/local/bin

# Install zvm (Zig Version Manager — https://github.com/tristanisham/zvm).
# Users pick a Zig/ZLS version at runtime inside the container, e.g.:
#   zvm i master              # install Zig master
#   zvm i --zls master        # install the matching ZLS
#   zvm i 0.13.0              # install a specific tagged release
#   zvm use 0.13.0            # switch the active version
# Active zig/zls are symlinked into $ZVM_PATH/bin, the zvm binary itself
# lives in $ZVM_PATH/self — both are added to PATH below.
ENV ZVM_PATH=/root/.zvm
ENV PATH="${ZVM_PATH}/bin:${ZVM_PATH}/self:${PATH}"
RUN curl -fsSL https://raw.githubusercontent.com/tristanisham/zvm/master/install.sh | bash \
    && echo 'export ZVM_PATH="$HOME/.zvm"' >> /root/.bashrc \
    && echo 'export PATH="$ZVM_PATH/bin:$ZVM_PATH/self:$PATH"' >> /root/.bashrc

# Set working directory to root home
WORKDIR /root

# Configure bash prompt to show container name
RUN echo 'PS1="\[\033[01;32m\][code-container]\[\033[00m\] \[\033[01;34m\]\w\[\033[00m\]\$ "' >> /root/.bashrc

# Source NVM in bashrc for interactive shells
RUN echo 'export NVM_DIR="$HOME/.nvm"' >> /root/.bashrc \
    && echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> /root/.bashrc \
    && echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> /root/.bashrc

# Default command: bash shell
CMD ["/bin/bash"]
