import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

for (const [name, path, hostname] of [
  ["DEV", "nginx.dev.conf", "dev.shopnest.co.il"],
  ["STAGING", "nginx.staging.conf", "staging.shopnest.co.il"],
]) {
  test(`${name} nginx has origin-side flood and slow-client hardening`, () => {
    const nginx = read(path);

    assert.match(nginx, new RegExp(`server_name\\s+${hostname.replaceAll(".", "\\.")};`));

    assert.match(nginx, /limit_req_zone\s+\$server_name\s+zone=server_rate:10m\s+rate=200r\/s;/);
    assert.match(nginx, /limit_conn_zone\s+\$server_name\s+zone=server_conn:10m;/);
    assert.match(nginx, /limit_req\s+zone=server_rate\s+burst=400\s+nodelay;/);
    assert.match(nginx, /limit_req_status\s+429;/);
    assert.match(nginx, /limit_conn\s+server_conn\s+200;/);
    assert.match(nginx, /limit_conn_status\s+429;/);

    assert.match(nginx, /client_header_timeout\s+10s;/);
    assert.match(nginx, /client_body_timeout\s+15s;/);
    assert.match(nginx, /send_timeout\s+30s;/);
    assert.match(nginx, /keepalive_timeout\s+30s;/);
    assert.match(nginx, /keepalive_requests\s+1000;/);
    assert.match(nginx, /reset_timedout_connection\s+on;/);
    assert.match(nginx, /client_max_body_size\s+6m;/);

    assert.match(nginx, /proxy_connect_timeout\s+5s;/);
    assert.match(nginx, /proxy_send_timeout\s+60s;/);
    assert.match(nginx, /proxy_read_timeout\s+60s;/);

    assert.match(nginx, /proxy_set_header\s+X-Forwarded-Host\s+\$host;/);
    assert.match(nginx, /proxy_set_header\s+X-Forwarded-Proto\s+\$forwarded_proto;/);

    // Do not apply an origin-side per-client limit to $remote_addr here:
    // the container is reached through host nginx, so that address represents
    // the reverse proxy rather than a trustworthy end-client identity.
    assert.doesNotMatch(nginx, /limit_(?:req|conn)_zone\s+\$binary_remote_addr/);
  });
}
