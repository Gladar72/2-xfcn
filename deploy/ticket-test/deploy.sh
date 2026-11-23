#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/mesto/ticket-test
exec 9>deploy.lock
flock 9
release=$1
[[ $release =~ ^[a-f0-9]{40}$ ]]
printf 'RELEASE_SHA=%s\n' "$release" > release.env
install -m 600 "incoming-$release/payment.env" payment.env
for f in compose.yml database.Caddyfile settings.py worker.cjs; do install -m 600 "incoming-$release/$f" "$f"; done
python3 settings.py
rm -f payment.env "incoming-$release/payment.env"
dc() { sudo docker compose -p mesto-ticket-test --env-file database.env --env-file release.env -f compose.yml "$@"; }
dc up -d db
for _ in {1..60}; do dc exec -T db pg_isready -q -U postgres -d ticket_test && break; sleep 2; done
dc exec -T db pg_isready -q -U postgres -d ticket_test
ready=$(dc exec -T db psql -XAt -U postgres -d ticket_test -c "select to_regprocedure('public.ticket_test_guest(text)') is not null")
if [[ $ready != t ]]; then
  # pg_dump --schema-only reads definitions. No public table rows are exported.
  sudo docker exec supabase-db pg_dump -U postgres -d postgres --format=custom --schema-only \
    --no-owner --no-acl --no-comments --no-security-labels --no-publications --no-subscriptions \
    --table='public.*' --exclude-table=public.ticket_sales --exclude-table=public.ticket_orders > "incoming-$release/schema.dump"
  dc exec -T db mkdir -p /tmp/ticket-install
  tar -C "incoming-$release" -cf - schema.dump bootstrap.sql bootstrap-db.sh fixtures.sql migrations | dc exec -T db tar -C /tmp/ticket-install -xf -
  dc exec -T db bash /tmp/ticket-install/bootstrap-db.sh
  dc exec -T db rm -rf /tmp/ticket-install
  rm "incoming-$release/schema.dump"
fi
# Hex-only locally generated password: never print the statement or pass credentials via argv.
python3 - <<'PY' | dc exec -T db psql -Xq -v ON_ERROR_STOP=1 -U postgres -d ticket_test >/dev/null
from pathlib import Path
import re
password = dict(x.split("=",1) for x in Path("database.env").read_text().splitlines())["REST_PASSWORD"]
assert re.fullmatch("[0-9a-f]{64}", password)
print("alter role ticket_rest password '" + password + "';")
PY
dc up -d rest gateway app refunds
for _ in {1..50}; do
  if curl --max-time 4 -fsS http://127.0.0.1:3087/ticket-test-health -o health.json 2>/dev/null; then break; fi
  sleep 2
done
python3 - <<'PY'
import json,urllib.request
u="http://127.0.0.1:3087/ticket-test-health"
data=json.load(urllib.request.urlopen(u,timeout=8))
assert data["environment"]=="ticket-test" and data["ready"] is True
print("Sandbox database, both paid events and test acquiring are configured. Demo receipts:",data["demoReceipts"])
PY
dc exec -T app node < "incoming-$release/verify.cjs"
# Validate a candidate based on the exact current Caddy config before live reload.
caddy=$(sudo docker ps -q --filter label=com.docker.compose.project=mesto --filter label=com.docker.compose.service=caddy)
[[ -n "$caddy" && "$caddy" != *$'\n'* ]]
sudo docker exec "$caddy" cat /etc/caddy/Caddyfile > previous.Caddyfile
python3 "incoming-$release/route.py" previous.Caddyfile candidate.Caddyfile
sudo docker cp candidate.Caddyfile "$caddy:/tmp/mesto-tickets.Caddyfile"
sudo docker exec "$caddy" caddy validate --adapter caddyfile --config /tmp/mesto-tickets.Caddyfile > /dev/null
if ! cmp -s previous.Caddyfile candidate.Caddyfile; then
  sudo docker exec "$caddy" caddy reload --adapter caddyfile --config /tmp/mesto-tickets.Caddyfile
fi
if ! curl -fsS --max-time 10 --resolve mesto-go.ru:443:127.0.0.1 https://mesto-go.ru/ticket-test/ticket-test-health | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["ready"] and d["environment"]=="ticket-test"'; then
  sudo docker exec "$caddy" caddy reload --adapter caddyfile --config /etc/caddy/Caddyfile
  exit 1
fi
echo "Isolated HTTPS ticket API is ready"
