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
# has_value rather than reading straight through: bashio hands back the literal
# string "null" for an option that was never given a value, which is truthy and
# would be taken for a real setting.
if bashio::config.has_value 'image_base_url'; then
    export IMAGE_BASE_URL="$(bashio::config 'image_base_url')"
    bashio::log.info "Device will fetch images from ${IMAGE_BASE_URL}"
else
    bashio::log.info "No image_base_url set; asking the Supervisor for this host's address"
fi

if bashio::config.has_value 'firmware_repo'; then
    export FIRMWARE_REPO="$(bashio::config 'firmware_repo')"
    bashio::log.info "Watching ${FIRMWARE_REPO} for firmware releases"
else
    bashio::log.info "No firmware_repo set; over-the-air updates are off"
fi

if bashio::config.has_value 'github_token'; then
    export FIRMWARE_TOKEN="$(bashio::config 'github_token')"
    bashio::log.info "Using a GitHub token for the firmware repo"
else
    bashio::log.info "No github_token set; only a public firmware repo will be visible"
fi

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

# Discovery is on by default. Clearing the prefix turns it off -- but entities
# already announced stay, because they are retained messages held by the broker
# rather than something this add-on can take back by going quiet.
if bashio::config.has_value 'discovery_prefix'; then
    export DISCOVERY_PREFIX="$(bashio::config 'discovery_prefix')"
    bashio::log.info "Announcing entities to Home Assistant under '${DISCOVERY_PREFIX}'"
else
    export DISCOVERY_PREFIX=""
    bashio::log.info "MQTT discovery is off; no entities will be created"
fi

bashio::log.info "Starting Inkplate Dashboard for device '${DEVICE_ID}'"
bashio::log.info "Serving image blobs to the device on port ${DEVICE_PORT}"
python3 -m uvicorn device_api:app --host 0.0.0.0 --port "${DEVICE_PORT}" &

exec python3 -m uvicorn main:app --host 0.0.0.0 --port "${PORT}"
