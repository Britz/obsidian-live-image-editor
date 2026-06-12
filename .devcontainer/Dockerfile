ARG VARIANT=22
FROM mcr.microsoft.com/devcontainers/typescript-node:${VARIANT}


ARG USER_NAME=vcode
ARG USER_UID=1000
COPY .env /tmp/build.env

RUN set -eux; \
    . /tmp/build.env; \
    : "${USER_GID:=1000}"; \
    if id -u "${USER_NAME}" >/dev/null 2>&1 && [ "$(id -u "${USER_NAME}")" != "${USER_UID}" ]; then \
        userdel -r "${USER_NAME}"; \
    fi; \
    if ! id -nu "${USER_UID}" >/dev/null 2>&1; then \
        getent group "${USER_GID}" >/dev/null 2>&1 || groupadd --gid "${USER_GID}" "${USER_NAME}"; \
        useradd --uid "${USER_UID}" --gid "${USER_GID}" --create-home --shell /bin/bash "${USER_NAME}"; \
        echo "${USER_NAME} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/${USER_NAME}"; \
        chmod 0440 "/etc/sudoers.d/${USER_NAME}"; \
    fi

