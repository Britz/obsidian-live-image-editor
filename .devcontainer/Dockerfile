ARG VARIANT=22
FROM mcr.microsoft.com/devcontainers/typescript-node:${VARIANT}


ARG USER_NAME=vcode
ARG USER_UID=1000
COPY .env /tmp/build.env

RUN set -eux; \
    . /tmp/build.env; \
    if id -u "${USER_NAME}" >/dev/null 2>&1 && [ "$(id -u "${USER_NAME}")" != "${USER_UID}" ]; then \
        userdel -r "${USER_NAME}"; \
    fi; \
    if ! id -nu "${USER_UID}" >/dev/null 2>&1; then \
        useradd --uid "${USER_UID}" --create-home --shell /bin/bash --user-group "${USER_NAME}"; \
        echo "${USER_NAME} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/${USER_NAME}"; \
        chmod 0440 "/etc/sudoers.d/${USER_NAME}"; \
    fi

