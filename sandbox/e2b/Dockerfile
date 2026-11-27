FROM kalilinux/kali-rolling

ENV DEBIAN_FRONTEND=noninteractive
ENV HOME=/root
ENV PATH=/root/.local/bin:/usr/local/go/bin:/root/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

SHELL ["/bin/bash", "-c"]

# Heavy logic lives in a script because E2B's Dockerfile parser strips
# backslashes from RUN arguments.
COPY setup.sh /tmp/setup.sh
RUN bash /tmp/setup.sh && rm -f /tmp/setup.sh

WORKDIR /root
