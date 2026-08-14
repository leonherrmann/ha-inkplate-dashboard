ARG BUILD_FROM
FROM $BUILD_FROM

# The editor is built ahead of time and committed as frontend/dist, so the image
# stays Python-only and installs quickly on Raspberry Pi class hardware.
COPY backend/requirements.txt /tmp/requirements.txt
RUN \
    apk add --no-cache python3 py3-pip && \
    pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt

COPY run.sh /
RUN chmod a+x /run.sh

WORKDIR /app
COPY backend/ /app/
COPY frontend/dist /app/static

EXPOSE 8099

CMD [ "/run.sh" ]
