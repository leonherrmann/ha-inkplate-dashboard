ARG BUILD_FROM
FROM $BUILD_FROM

# The editor is built ahead of time and committed as frontend/dist, so the image
# stays Python-only and installs quickly on Raspberry Pi class hardware.
COPY backend/requirements.txt /tmp/requirements.txt
RUN \
    # py3-pillow rather than pip: Alpine ships a prebuilt wheel for every arch,
# while pip would compile it from source on armv7.
    apk add --no-cache python3 py3-pip py3-pillow && \
    pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt

COPY run.sh /
RUN chmod a+x /run.sh

WORKDIR /app
COPY backend/ /app/
COPY frontend/dist /app/static

EXPOSE 8099 8098

CMD [ "/run.sh" ]
