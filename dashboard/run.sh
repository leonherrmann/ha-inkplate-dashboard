#!/usr/bin/with-contenv bashio
# ==============================================================================
# Start the Inkplate Dashboard add-on
# ==============================================================================

export PORT=8099
# Plain HTTP for the device: ingress is authenticated and the Inkplate
# cannot log in, so image blobs are served here instead.
export DEVICE_PORT=8098
export DATA_DIR=/data
export STATIC_DIR=/app/static
export DEVICE_ID="$(bashio::config 'device_id')"
export LOG_LEVEL="$(bashio::config 'log_level')"
export IMAGE_BASE_URL="$(bashio::config 'image_base_url')"

# ------------------------------------------------------------------------------
# MQTT: manual options win, otherwise use the broker Home Assistant provides.
# ------------------------------------------------------------------------------
if bashio::config.has_value 'mqtt_host'; then
    bashio::log.info "Using MQTT broker from add-on options"
    export MQTT_HOST="$(bashio::config 'mqtt_host')"
    export MQTT_PORT="$(bashio::config 'mqtt_port')"
    export MQTT_USER="$(bashio::config 'mqtt_user')"
    export MQTT_PASSWORD="$(bashio::config 'mqtt_password')"
elif bashio::services.available mqtt; then
    bashio::log.info "Using MQTT broker provided by Home Assistant"
    export MQTT_HOST="$(bashio::services mqtt 'host')"
    export MQTT_PORT="$(bashio::services mqtt 'port')"
    export MQTT_USER="$(bashio::services mqtt 'username')"
    export MQTT_PASSWORD="$(bashio::services mqtt 'password')"
else
    bashio::log.error "No MQTT broker configured or detected - the device cannot be reached"
fi

bashio::log.info "Starting Inkplate Dashboard for device '${DEVICE_ID}'"
bashio::log.info "Serving image blobs to the device on port ${DEVICE_PORT}"
python3 -m uvicorn device_api:app --host 0.0.0.0 --port "${DEVICE_PORT}" &

exec python3 -m uvicorn main:app --host 0.0.0.0 --port "${PORT}"
