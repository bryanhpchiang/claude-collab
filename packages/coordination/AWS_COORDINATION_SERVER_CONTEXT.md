# AWS Coordination Server Context

Deployment notes for the Jam coordination-server on AWS. The CI/App Runner path is live, the AWS side is now wired for Better Auth + PostgreSQL, and the remaining step is merging the current coordination branch so App Runner pulls a new `main` image.

## Purpose

The deployment model is:

1. GitHub Actions runs on a CodeBuild-hosted runner.
2. The workflow builds `packages/coordination/Dockerfile`.
3. The workflow pushes the image to ECR.
4. App Runner tracks the stable ECR tag and auto-deploys the coordination server.

This is for the `packages/coordination/` service in this repo.

## Verified AWS State

Verified during this session against account `757208469216` in `us-east-1`.

### ECR

- Repository name: `jam/coordination-server`
- Repository ARN: `arn:aws:ecr:us-east-1:757208469216:repository/jam/coordination-server`
- Repository URI: `757208469216.dkr.ecr.us-east-1.amazonaws.com/jam/coordination-server`
- Created: `2026-03-22T20:33:10.627-07:00`
- Image scanning: enabled on push
- Tag mutability: mutable
- Lifecycle policy: keep last 25 images
- Current deployed App Runner image tag: `main`

### CodeBuild Runner

- Project name: `JamCoordinationServerRunner`
- Project ARN: `arn:aws:codebuild:us-east-1:757208469216:project/JamCoordinationServerRunner`
- Source repo: `https://github.com/bryanhpchiang/claude-collab`
- Environment image: `aws/codebuild/standard:7.0`
- Compute type: `BUILD_GENERAL1_MEDIUM`
- Privileged mode: enabled
- Service role: `arn:aws:iam::757208469216:role/JamCoordinationServerCodeBuildRole`
- Webhook status: `ACTIVE`
- Webhook event filter: `WORKFLOW_JOB_QUEUED`
- GitHub webhook URL created on repo: `https://api.github.com/repos/bryanhpchiang/claude-collab/hooks/602181871`

### CodeConnections / CodeBuild Source Credential

- CodeBuild source credential ARN: `arn:aws:codebuild:us-east-1:757208469216:token/github`
- Auth type: `CODECONNECTIONS`
- Active connection ARN: `arn:aws:codeconnections:us-east-1:757208469216:connection/457ca9b9-4836-4ac3-8a26-ae10226358a6`
- Active connection name: `github-connection-bryan`

Important: the earlier Liam-scoped connection caused `Access denied to connection ...` during webhook creation. The Bryan-scoped connection fixed that.

### IAM Roles

#### App Runner ECR access role

- Role name: `JamCoordinationServerEcrAccessRole`
- Role ARN: `arn:aws:iam::757208469216:role/JamCoordinationServerEcrAccessRole`
- Trust principal: `build.apprunner.amazonaws.com`
- Attached managed policy: `arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess`

#### App Runner instance role

- Role name: `JamCoordinationServerInstanceRole`
- Role ARN: `arn:aws:iam::757208469216:role/JamCoordinationServerInstanceRole`
- Trust principal: `tasks.apprunner.amazonaws.com`
- Attached policy: `arn:aws:iam::757208469216:policy/JamEC2Manager`
- Additional inline secret access observed in practice:
  - `secretsmanager:GetSecretValue`
  - `secretsmanager:DescribeSecret`
  - scoped to `jam/coordination-server/*`

#### CodeBuild runner role

- Role name: `JamCoordinationServerCodeBuildRole`
- Role ARN: `arn:aws:iam::757208469216:role/JamCoordinationServerCodeBuildRole`
- Trust principal: `codebuild.amazonaws.com`
- Inline policies:
  - `JamCoordinationServerCodeBuildPolicy`
  - `CodeConnections`

The `CodeConnections` inline policy was required because the working `RebelCodeBuild` role also had it, and webhook creation failed until this was added.

### Existing Jam Runtime Inputs

These values are already established elsewhere and are passed into App Runner:

- Jam base AMI: `ami-0b694e8fc9890bec7`
- Jam security group: `sg-092ad16c7428104a3`
- Jam instance tag prefix: `jam-`
- Default Jam instance type in current code and App Runner config: `t3.medium`

### RDS PostgreSQL

- DB instance identifier: `jam-db`
- DB instance ARN: `arn:aws:rds:us-east-1:757208469216:db:jam-db`
- Engine: `postgres`
- Engine version: `17.6`
- Instance class: `db.t4g.micro`
- Status: `available`
- Endpoint: `jam-db.cmxgiceqmvck.us-east-1.rds.amazonaws.com:5432`
- VPC: `vpc-0d596b68da1bd3c4d`
- DB subnet group: `default-vpc-0d596b68da1bd3c4d`
- Publicly accessible: `true`
- Storage encrypted: `true`
- CA certificate identifier: `rds-ca-rsa2048-g1`
- Attached DB security group: `sg-011075793df501f9c`
- Master user secret ARN: `arn:aws:secretsmanager:us-east-1:757208469216:secret:rds!db-b7ed02ed-6008-4ce0-b46b-773c8e831388-QBtEre`

Networking note: this DB was deliberately made public because the default VPC has no NAT gateways and no relevant VPC endpoints. Moving App Runner onto VPC egress without NAT would have broken GitHub OAuth and AWS API access for the coordination service.

### Secrets Manager

Relevant secret names currently present:

- `jam/coordination-server/GITHUB_CLIENT_SECRET`
- `jam/coordination-server/DATABASE_URL`
- `jam/coordination-server/BETTER_AUTH_SECRET`

Observed leftover secret:

- `jam/coordination-server/CLERK_SECRET_KEY`

`DATABASE_URL` currently points at the public RDS instance and uses the `postgres` database with SSL required.

### App Runner

- Service name: `JamCoordinationServer`
- Service ID: `114290c495864fafb7d5dd61960deef7`
- Service ARN: `arn:aws:apprunner:us-east-1:757208469216:service/JamCoordinationServer/114290c495864fafb7d5dd61960deef7`
- Service URL: `https://vjqmk2uvpa.us-east-1.awsapprunner.com`
- Created: `2026-03-22T21:11:30.380-07:00`
- Source image: `757208469216.dkr.ecr.us-east-1.amazonaws.com/jam/coordination-server:main`
- Auto deployments: enabled
- Service status: `RUNNING`
- Health check: HTTP `GET /health` on port `8080`
- Instance size: `1 vCPU / 2 GB`
- Network configuration:
  - ingress: public
  - egress: `DEFAULT`
  - no VPC connector attached

Runtime environment variables currently configured:

- `AWS_REGION=us-east-1`
- `BASE_URL=https://letsjam.now`
- `GITHUB_CLIENT_ID=Ov23lifEmofKDFsIojfd`
- `JAM_AMI_ID=ami-0b694e8fc9890bec7`
- `JAM_INSTANCE_TYPE=t3.medium`
- `JAM_SECURITY_GROUP_ID=sg-092ad16c7428104a3`
- `JAM_TAG_PREFIX=jam-`

Runtime environment secrets currently configured:

- `BETTER_AUTH_SECRET=arn:aws:secretsmanager:us-east-1:757208469216:secret:jam/coordination-server/BETTER_AUTH_SECRET-SV2VhI`
- `DATABASE_URL=arn:aws:secretsmanager:us-east-1:757208469216:secret:jam/coordination-server/DATABASE_URL-2TyOi3`
- `GITHUB_CLIENT_SECRET=arn:aws:secretsmanager:us-east-1:757208469216:secret:jam/coordination-server/GITHUB_CLIENT_SECRET-lNwOXe`

Observed deployment result:

- App Runner service logs show:
  - image pulled successfully from ECR
  - instance provisioned
  - health check passed on `/health`
  - traffic routing started
- External verification:
  - `curl https://vjqmk2uvpa.us-east-1.awsapprunner.com/health`
  - response: `{"ok":true,"service":"jam-coordination"}`
  - `curl https://letsjam.now/health`
  - response: `{"ok":true,"service":"jam-coordination"}`

Important status note: the AWS-side env/secrets are already wired for Better Auth + Postgres, but the currently running App Runner image is still the older `main` image from before the coordination auth migration branch was merged.

### Custom Domain

- App Runner custom domain: `letsjam.now`
- Status: `active`
- App Runner DNS target: `vjqmk2uvpa.us-east-1.awsapprunner.com`

GitHub OAuth callback has now been updated to:

- `https://letsjam.now/api/auth/callback/github`

## Repo Changes Already On `main`

These repo-side changes are already on `main` and are what produced the current ECR-backed App Runner deployment:

- Added `.github/workflows/deploy-coordination-server.yml`
- Updated `packages/coordination/Dockerfile`
- Updated `packages/coordination/src/index.ts`

Relevant commits:

- `1baf978` `feat: add coordination server deploy workflow`
- `01cc7a2` `fix: avoid docker hub rate limits in coordination image build`

The workflow expects:

- CodeBuild project name: `JamCoordinationServerRunner`
- ECR repo name: `jam/coordination-server`
- Stable deploy tag: `main`

Those changes do the following:

- add `/health` for App Runner health checks
- move AWS/Jam runtime settings to env vars
- allow `BASE_URL` to be derived from the request origin when unset
- disable GitHub sign-in UI when OAuth secrets are not configured
- keep cookies secure-aware when served over HTTPS

## Current Branch Changes Pending Merge

Current branch:

- `codex/better-auth-postgres`

Current PR:

- `https://github.com/bryanhpchiang/claude-collab/pull/5`

Current branch head:

- `7a4afcf` `feat: switch coordination auth to better auth and postgres`

That pending branch does the following:

- replaces the bespoke GitHub OAuth flow with Better Auth mounted at `/api/auth/*`
- preserves `/auth/github` and `/auth/logout` as compatibility wrappers for the current UI
- moves jam metadata persistence from DynamoDB to PostgreSQL via `jam_records`
- requires `DATABASE_URL` and `BETTER_AUTH_SECRET`
- runs Better Auth migrations plus `jam_records` table creation at startup
- downloads the Amazon RDS global CA bundle into the coordination image
- configures the Postgres client to trust the RDS CA explicitly instead of relying on `sslmode` in the URL
- updates docs for the new auth callback and database setup

Branch-level verification already completed:

- `bun test packages/coordination`
- live-started the coordination server against the real `jam-db` RDS endpoint using the production secrets plus the AWS RDS CA bundle
- verified `/health` returned `200 OK`
- verified `/auth/github` returned a `302` redirect to GitHub with `redirect_uri=https://letsjam.now/api/auth/callback/github`

Known limitation of the branch:

- no backfill from existing DynamoDB jam metadata to PostgreSQL

## GitHub Actions History

Workflow: `Deploy Coordination Server`

- First run:
  - GitHub run ID: `23420960882`
  - commit: `1baf978`
  - result: `failure`
  - cause: Docker Hub unauthenticated pull rate limit on `FROM oven/bun:1`
- Second run:
  - GitHub run ID: `23421007501`
  - commit: `01cc7a2`
  - result: `success`
  - effect: pushed the first production image into ECR

Next expected run:

- merge PR `#5`
- GitHub Actions rebuilds `jam/coordination-server:main`
- App Runner auto-deploys the new image because ECR auto deployments are enabled

## Known Debugging History

- `GithubBryan` in App Runner was a false start and is not part of the final setup.
- The intended final model is ECR-backed App Runner, not GitHub-backed App Runner.
- Comparing against `RebelCodeBuild` was useful because it showed:
  - CodeBuild-hosted GitHub Actions runner projects use a normal `GITHUB` source plus a `WORKFLOW_JOB_QUEUED` webhook
  - the CodeBuild service role also needs CodeConnections permissions
  - the active CodeConnections GitHub connection must have access to the target repo owner
- The first GitHub Actions run reached CodeBuild and ECR login successfully, but failed at `docker build` because `FROM oven/bun:1` hit Docker Hub's unauthenticated pull-rate limit (`429 Too Many Requests`).
- The Dockerfile was then changed to use `public.ecr.aws/docker/library/debian:bookworm-slim` and install Bun explicitly, so future runs do not rely on Docker Hub for the base image.
- `jam-db` started as a private RDS instance, but the public-DB route was chosen to avoid adding an App Runner VPC connector plus NAT gateway costs.
- The first Better Auth/Postgres startup attempt failed with `SELF_SIGNED_CERT_IN_CHAIN` against RDS. The fix was to ship the AWS RDS global CA bundle in the coordination image and pass `pg` an explicit `ssl.ca` config while keeping certificate validation enabled.

## What Is Still Not Done

- Merge PR `#5` so the Better Auth + PostgreSQL code actually reaches App Runner
- Verify the live App Runner deployment creates the Better Auth tables plus `jam_records` in `jam-db`
- Verify end-to-end GitHub sign-in on `https://letsjam.now`
- Verify the live coordination server can assume `JamCoordinationServerInstanceRole` and launch Jam EC2 instances end-to-end
- Decide whether the public RDS posture is acceptable long-term or whether to move to private DB networking later
- Backfill any existing DynamoDB jam metadata into PostgreSQL if historical records matter
- Remove stale secrets like `jam/coordination-server/CLERK_SECRET_KEY` if they are no longer needed

## Next Likely Commands

1. Merge PR `#5`.
2. Watch the deploy workflow and App Runner rollout:
   - `gh run watch`
   - `aws apprunner list-operations --service-arn arn:aws:apprunner:us-east-1:757208469216:service/JamCoordinationServer/114290c495864fafb7d5dd61960deef7 --region us-east-1`
3. Re-verify after deploy:
   - `curl https://letsjam.now/health`
   - GitHub login redirect flow
   - Better Auth session creation
   - Jam EC2 launch path
