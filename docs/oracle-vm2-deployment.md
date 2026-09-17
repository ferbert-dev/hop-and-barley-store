# Oracle VM2 deployment runbook

This runbook deploys the reviewed Hop & Barley release to the existing Ubuntu
VM2 as the isolated Compose project `hopbarley`. It does not operate on the
stopped OpenClaw containers, images, networks, volumes, or files.

## Release contract

Deployments are manual GitHub Actions dispatches from `main`, with a required
version tag such as `V1.0.0`. The tag must point to a commit in `main` history
with successful main-push CI and independent review evidence. The first version
is **V1.0.0**. Each later release gets a new version tag; never move or reuse a
successful version for different code or images.

| Reference                                        | Meaning                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| Git tag `V1.0.0`                                 | Named source revision in `main` history                              |
| Saved Docker image IDs                           | Exact artifacts used by Compose                                      |
| Docker tags `hopbarley/{web,api,migrate}:V1.0.0` | Retained aliases for that successful version                         |
| Docker `latest` tags and server `latest.json`    | Most recently successful deployment, including a successful rollback |

`latest` is a convenience pointer, never a deployment input. There is no moving
Git `latest` tag. Failed candidates do not become the successful release.
Patch fixes normally increment to `V1.0.1`, compatible features to `V1.1.0`, and
breaking changes to `V2.0.0`; the operator selects the release version.

For a new release, the workflow:

1. Resolves the selected tag and rejects missing, malformed, or non-main tags.
   Lightweight and annotated version tags are supported.
2. Requires successful CI for that exact commit, then checks out its source.
3. Builds three `linux/amd64` images on GitHub, tags them with the full SHA and
   labels them with the SHA and version. The web build embeds
   `NEXT_PUBLIC_API_URL=https://hopbarley.shop` and
   `NEXT_PUBLIC_API_HOST_ALIASES=hopbarley.shop`.
4. Computes the compressed image archive SHA-256 and delivers it with strict
   SSH host-key verification. The forced command is
   `deploy VERSION SHA ARCHIVE_SHA256`, or `deploy-initial VERSION SHA ARCHIVE_SHA256`
   for the first deployment. Environment secrets are `VM2_DEPLOY_SSH_KEY` and
   `VM2_KNOWN_HOSTS`.
5. The receiver independently verifies the tag/main relationship, validates
   the archive and image labels, and deploys pinned image IDs. Version and
   `latest` references are promoted only after readiness and public HTTPS
   checks pass.

Restrict GitHub's `production` environment to `main`. Ordinary pushes do not
trigger deployment. Local builds are validation only; production artifacts
come from GitHub Actions.

## One-time VM preparation

DNS A records for `hopbarley.shop` and `www.hopbarley.shop` must resolve to
`141.144.249.25`. TCP 80 and 443 must be reachable before Caddy requests
certificates. Keep SSH on TCP 22.

Install `deploy/receive-release.py` as a root-owned executable and configure
the dedicated SSH key as a forced command that passes only
`SSH_ORIGINAL_COMMAND` to it. The receiver deliberately accepts one exact
command grammar, a version tag from main history, its 40-character SHA, an
archive SHA-256, and a bounded input stream. It hashes the received bytes before parsing or loading
them and records the verified digest as `images.sha256`. It fetches only these
deployment files from that exact Git revision:

- `deploy/compose.prod.yaml`
- `deploy/Caddyfile`
- `deploy/generate-env.sh`
- `deploy/deploy-release.sh`

The receiver writes releases under `/opt/hopbarley/releases/<version>`, preserves
the prior release through `/opt/hopbarley/previous`, and switches
`/opt/hopbarley/current` only after a successful deployment. It verifies that
the archive contains exactly the three expected tags, then checks the image
platform, revision and version labels after loading. Each successful version
has an append-only `success.json` with image IDs and a database migration
fingerprint. An existing successful version cannot be rebuilt in place.

An immutable `candidate.json` binds an in-progress version to its source and
original image IDs before application changes. `deployment.json` records the
completed deployment and migration fingerprint. These records let a retry reuse
the original artifacts and finish interrupted promotion without replacing a
version's identity.

On the first `deploy-initial`, the receiver creates
`/etc/hopbarley/production.env` with mode `600`. The generator produces the
database password and two CSRF keyrings on VM2 and never prints them. Every
release gets a protected `release.env` beside its image archive; it combines
the stable server secrets with the exact loaded Docker image IDs. Never store
either environment file in GitHub, Actions output, or deployment logs.

The base environment starts with reviewed exact Caddy and PostgreSQL tags.
Record their resolved image IDs or registry digests in the deployment evidence.
Changing either dependency requires review; the receiver does not accept image
names from workflow inputs.

## Dispatch and first release

After merging and passing CI, create the annotated Git tag `V1.0.0` on the
validated commit and push the new tag without force. Do not tag the deployment
feature branch before merge.

In GitHub Actions select **Deploy Oracle VM2**, branch `main`,
`release_tag=V1.0.0`, and `operation=release`. Set `seed_initial=true` only for
that initial version, including its interrupted retries; later releases leave it
false. Subsequent improvements
follow the same merge/check/tag/dispatch sequence with a new version.

The receiver runs the release's `deploy-release.sh`. That script:

1. requires the release environment file to have mode `600`;
2. validates the production Compose configuration;
3. starts only the Hop & Barley PostgreSQL service and waits for readiness;
4. detects existing Prisma migration history;
5. for an existing database, stops Hop & Barley's Caddy/web/API services,
   verifies free disk space, and creates a mode-`600` custom-format
   pre-migration backup under the release's `backups/` directory;
6. applies committed Prisma migrations through the one-shot migration image;
7. on the initial deployment only, proves there are no products and categories
   contain only the reviewed migration reference data before running the seed; and
8. starts API, web, and Caddy and waits for all health checks.

The short update outage prevents the prior API from serving across a schema
change and keeps migration-time memory bounded on the 1 GB VM. Migration and
seed are manual profile services, so ordinary Compose startup cannot rerun
them.

## Verification

The workflow probes the public web and API after the receiver completes.
Record the workflow URL plus the exact SHA, image IDs, migration result, backup
path when applicable, and these VM checks:

```sh
sudo docker compose --env-file /opt/hopbarley/current/release.env \
  -f /opt/hopbarley/current/deploy/compose.prod.yaml ps
curl --fail --silent --show-error https://hopbarley.shop/api/v1/health/ready
curl --fail --silent --show-error --output /dev/null https://hopbarley.shop/
curl --head https://www.hopbarley.shop/a-path
sudo docker stats --no-stream
sudo docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' \
  $(sudo docker ps -aq --filter label=com.docker.compose.project=hopbarley)
```

Require the `www` response to redirect permanently to the same path on
`https://hopbarley.shop`. Complete a browser smoke check for catalog, cart,
registration, login, and an uploaded product image. Verify that PostgreSQL and
application ports are absent from the host's published-port list and that only
Hop & Barley containers use its four named volumes.

Payments must remain unavailable because Stripe is deliberately disabled.
External email delivery is not configured. Login and registration rate limits
currently see Caddy's Docker address because the API deliberately does not
trust proxy headers, so users share those endpoint buckets. Do not enable broad
proxy trust as an operations workaround; preserving client identity safely
belongs to a separate application-security ticket.

## Update and rollback

Later releases retain previous successful images, configuration and manifests,
and create a protected database backup before migrations. These backups share
the VM disk; they are not off-host disaster-recovery copies.

To roll back, dispatch **Deploy Oracle VM2** from `main` with
`operation=rollback`, the previous successful `release_tag`, and
`seed_initial=false`. For example, after `V1.0.1`, select `V1.0.0`.

Rollback skips builds and archive transfer. The forced command is
`rollback VERSION SHA`. The receiver checks the version tag, retained successful
manifest and saved image IDs. It requires the current database migration
fingerprint to match the target release, then recreates only API/web/Caddy from
those saved images. It never runs migrations or seed. After successful HTTPS
checks, `current` and `latest` point to the selected version.

A failed rollback does not promote the target to `latest` and can require
operator recovery of application availability. If the schema differs, a separate
compatibility decision or forward fix is required. Database restoration is
destructive and requires explicit authority; it is never automatic. Application
rollback does not undo customer data.

To stop only Hop & Barley while preserving data, assets and certificates:

```sh
sudo docker compose --env-file /opt/hopbarley/current/release.env \
  -f /opt/hopbarley/current/deploy/compose.prod.yaml down
```

Never add `--volumes`, delete volumes, reset Prisma, or remove/restart OpenClaw
resources as part of release or rollback.

## Known limits

VM2 has about 954 MiB RAM, 2 GiB swap, and a single local disk. The service
memory ceilings and bounded Docker logs reduce runaway impact but do not
provide high availability. PostgreSQL, uploaded assets, Caddy state, releases,
and backups remain on that host until a separate off-host backup decision is
implemented. This is a low-traffic MVP deployment, not a real-commerce
availability or disaster-recovery claim.

## Retry an interrupted release

Rerun the same workflow inputs after a transient failure. For the first release,
keep `release_tag=V1.0.0`, `operation=release`, and `seed_initial=true` on the retry.
The server's initial-owner record permits only that same initial version and
commit to reuse its existing protected environment. Other releases cannot take
over an unfinished initialization.

The initial script records its progress. Before the first seed it proves there
are no products or custom categories; the migration itself creates reference
categories. The seed runs in one database transaction: on retry that initial
catalog can be seeded, while a committed seed is preserved and never
repeated over existing data. An inconsistent catalog state fails closed.

If deployment completed but promotion was interrupted, the receiver reuses the
retained candidate image IDs and checks the database fingerprint before
reconciling version aliases, success metadata, `latest`, and `current`. Existing
matching aliases are accepted; conflicting aliases are rejected. Public HTTPS
must pass before promotion. Returning to an older completed release uses the
explicit rollback operation above.

Retries do not authorize deleting state files, replacing version tags, resetting
the database, or pruning retained images. Missing artifacts or an unresolved
migration require diagnosis; rerunning cannot repair a failed SQL migration.
