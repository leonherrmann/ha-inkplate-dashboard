ARG BUILD_FROM

# ---- frontend build -------------------------------------------------------
# The editor is a Vite/React app; only the built assets end up in the runtime
# image, so node never ships to the device running Home Assistant.
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- runtime --------------------------------------------------------------
FROM $BUILD_FROM

COPY backend/requirements.txt /tmp/requirements.txt
RUN \
    apk add --no-cache python3 py3-pip && \
    pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt

COPY run.sh /
RUN chmod a+x /run.sh

WORKDIR /app
COPY backend/ /app/
COPY --from=frontend /build/dist /app/static

EXPOSE 8099

CMD [ "/run.sh" ]
