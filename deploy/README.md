# Cloud Run deployment

The site keeps its server-side PNG/ZIP compiler. Production runs the existing Dockerfile on Cloud Run; GitHub Actions deploys successful pushes to `main`.

## Resources

- Cloud Run service: `ompoke`, 1 vCPU / 1 GiB, 0 minimum / 2 maximum instances, concurrency 8, request timeout 120s.
- Artifact Registry Docker repository: `ompoke`, in the same region.
- Runtime service account: `ompoke-runtime`, with no project roles. The app only fetches public pinned SpriteCollab assets.
- Deploy service account: `ompoke-deploy`; Artifact Registry Writer on this repository, Service Account User on the runtime account, Cloud Run Developer on the `ompoke` service.
- Workload identity pool/provider restricted to numeric GitHub repository ID `1402857678`, owner ID `36938330`, `refs/heads/main`, and `.github/workflows/deploy.yml`.
- Public invocation must be configured on the service separately by an administrator. The deploy identity does not need permission to change service IAM.

Cloud Run's writable filesystem uses instance memory. The source cache is pruned to 64 MiB after completed writes; temporary in-flight downloads can briefly add to this. Generated packs are capped at 12 cached packs / 32 MiB; Sharp's cache is capped at 16 MiB. A maximum of three pack builds run at once. There is no always-running instance and no database.

## GitHub repository variables

Set these on `sohamb117/ompoke` after choosing the GCP project and public hostname:

| Variable                         | Value                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`                 | Selected project ID                                                                             |
| `GCP_REGION`                     | Cloud Run and Artifact Registry region                                                          |
| `GCP_RUNTIME_ACCOUNT`            | `ompoke-runtime@PROJECT_ID.iam.gserviceaccount.com`                                             |
| `GCP_DEPLOY_ACCOUNT`             | `ompoke-deploy@PROJECT_ID.iam.gserviceaccount.com`                                              |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/ompoke-github/providers/github` |
| `SITE_URL`                       | Public HTTPS origin, such as `https://pets.morisoba.moe`                                        |

The `production` GitHub environment is used for deployment. PRs only run tests and build checks. No service-account JSON key or long-lived GCP secret is needed. Generated federation credential files are excluded from Git and Docker's build context.

The deploy job is intentionally skipped until `GCP_PROJECT_ID` is configured. Bootstrap the service and its IAM before enabling the workflow; the workflow updates the existing service. The production image is built and smoke-tested (health, real preview, ZIP hash, native install URL) before being pushed or deployed.

## Cloudflare DNS

Use the actual records returned by the chosen GCP custom-domain setup. Do **not** CNAME directly to a `run.app` hostname: DNS alone does not configure Cloud Run's custom host routing/TLS.

For an eligible region, Cloud Run domain mapping supports managed certificates and returns the required DNS records, after verifying ownership of the parent domain. This mapping feature is currently Preview, and Google does not recommend it for production services. Alternatives are Firebase Hosting forwarding to Cloud Run or an external Application Load Balancer. Choose the mapping before changing DNS; leave existing personal-site records intact.

When Google is validating a domain/certificate through DNS, use DNS-only records initially and verify HTTPS before changing proxy settings. The existing OMP Pet 0.1.2 importer accepts `morisoba.moe`, `www.morisoba.moe`, and `pets.morisoba.moe`. A different hostname needs an app allowlist update. Set `SITE_URL` to the final approved hostname; do not leave it as localhost or an unapproved `run.app` host.

## Verification and rollback

After deploying, check `/healthz`, `/api/preview/0570?direction=1`, and `/api/packs/0570?direction=1` at the public origin. Verify ZIP SHA-256 against the preview's checksum and native pack validation. Direct adoption also requires working DNS/TLS on the hostname in `SITE_URL`.

Each image is tagged with its Git commit. Cloud Run retains revisions; roll back by sending traffic to a previously healthy revision. Images can be cleaned up with an Artifact Registry retention policy once a retention window is chosen.

References: [Cloud Run deployments](https://cloud.google.com/run/docs/deploying), [GitHub federation](https://github.com/google-github-actions/auth), [custom domain choices](https://cloud.google.com/run/docs/mapping-custom-domains).
