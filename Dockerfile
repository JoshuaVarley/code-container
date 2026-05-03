# Code Container
# Generic Dockerfile for running coding tools in isolated project environments

FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

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

# Install Claude Code globally via official installer
RUN curl -fsSL https://claude.ai/install.sh | bash
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

# Install Zig (master / nightly) — pulls the latest tarball from ziglang.org
RUN ARCH=$(uname -m) \
    && case "$ARCH" in \
         x86_64)  ZIG_ARCH="x86_64-linux" ;; \
         aarch64) ZIG_ARCH="aarch64-linux" ;; \
         *) echo "Unsupported architecture for zig: $ARCH" && exit 1 ;; \
       esac \
    && ZIG_URL=$(curl -fsSL https://ziglang.org/download/index.json \
        | python3 -c "import sys, json; print(json.load(sys.stdin)['master']['$ZIG_ARCH']['tarball'])") \
    && curl -fsSL "$ZIG_URL" -o /tmp/zig.tar.xz \
    && mkdir -p /opt/zig \
    && tar -xJf /tmp/zig.tar.xz -C /opt/zig --strip-components=1 \
    && ln -sf /opt/zig/zig /usr/local/bin/zig \
    && rm /tmp/zig.tar.xz

# Install ZLS (Zig Language Server) — matched to the installed Zig version
# via the official version-selector API at releases.zigtools.org
RUN ARCH=$(uname -m) \
    && case "$ARCH" in \
         x86_64)  ZLS_ARCH="x86_64-linux" ;; \
         aarch64) ZLS_ARCH="aarch64-linux" ;; \
         *) echo "Unsupported architecture for zls: $ARCH" && exit 1 ;; \
       esac \
    && ZIG_VERSION=$(zig version) \
    && ZLS_URL=$(curl -fsSL "https://releases.zigtools.org/v1/zls/select-version?zig_version=${ZIG_VERSION}&compatibility=only-runtime" \
        | python3 -c "import sys, json; d=json.load(sys.stdin); \
sys.exit('zls select-version error: ' + d['message']) if 'message' in d else print(d['$ZLS_ARCH']['tarball'])") \
    && curl -fsSL "$ZLS_URL" -o /tmp/zls.tar.xz \
    && mkdir -p /opt/zls \
    && tar -xJf /tmp/zls.tar.xz -C /opt/zls \
    && ZLS_BIN=$(find /opt/zls -type f -name zls -executable | head -n1) \
    && ln -sf "$ZLS_BIN" /usr/local/bin/zls \
    && rm /tmp/zls.tar.xz

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
