"""Entrypoint that runs the one FastAPI app on two ports at once, in the
same process (so they share one in-memory Game object) -- a public
listener for the player page, and an admin listener for /dm, which the
app's restrict_dm_to_admin_port middleware only allows requests through
on. Which port is actually reachable from where is up to how the
container's ports get published (see docker-compose.*.yml) -- this
script only needs to know what to bind to inside the container.

PORT: the public listener (default 8000).
ADMIN_PORT: the admin listener (default PORT + 100). Also read directly
by cybergame.server's middleware, so both have to agree -- they do,
because this is the one place both get computed.
ADMIN_BIND_HOST: what to bind the admin listener to *inside* the
container. "127.0.0.1" only makes sense under network_mode: host
(Linux), where that is also the real host's loopback -- the OS itself
then refuses to route anything from the LAN to it, no further publish
needed. Under ordinary bridge networking (Windows), the container's own
127.0.0.1 is unreachable even via Docker's own port-forwarding, so this
must be "0.0.0.0" there instead, and the loopback restriction comes from
the *host-side* half of the port mapping (127.0.0.1:hostport:containerport)
in the compose file -- a real socket-level guarantee Windows enforces
before traffic ever reaches Docker's forwarding layer.
"""
import asyncio
import os

import uvicorn

# server.py reads ADMIN_PORT from the environment at import time (for its
# gating middleware) -- compute the default here and set it explicitly
# *before* importing, so both this script and the app agree on it even
# when ADMIN_PORT was never passed in by the compose file.
_port = int(os.environ.get("PORT", "8000"))
os.environ.setdefault("ADMIN_PORT", str(_port + 100))

from cybergame.server import app  # noqa: E402


async def main():
    port = _port
    admin_port = int(os.environ["ADMIN_PORT"])
    admin_bind_host = os.environ.get("ADMIN_BIND_HOST", "127.0.0.1")

    public_config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="info")
    admin_config = uvicorn.Config(app, host=admin_bind_host, port=admin_port, log_level="info")

    public_server = uvicorn.Server(public_config)
    admin_server = uvicorn.Server(admin_config)

    await asyncio.gather(public_server.serve(), admin_server.serve())


if __name__ == "__main__":
    asyncio.run(main())
