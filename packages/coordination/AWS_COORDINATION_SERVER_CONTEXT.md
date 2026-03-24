# AWS Coordination Server Context

Deployment notes for the Jam coordination-server on AWS. This is still in progress, but the CI path and the first App Runner deployment are now live.

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
- Current image state:
  - tags: `main`, `01cc7a2cfdb78b08b08d0239eafe53e99d6c6e74`
  - pushed at: `2026-03-22T21:09:31.654-07:00`
  - digest: `sha256:f0f7fd5c8ecaef8975954965b4700c1f8f88216beff50cf669c5970371f1dc0a`

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

### App Runner

- Service name: `JamCoordinationServer`
- Service ID: `114290c495864fafb7d5dd61960deef7`
- Service ARN: `arn:aws:apprunner:us-east-1:757208469216:service/JamCoordinationServer/114290c495864fafb7d5dd61960deef7`
- Service URL: `https://vjqmk2uvpa.us-east-1.awsapprunner.com`
- Created: `2026-03-22T21:11:30.380-07:00`
- Source image: `757208469216.dkr.ecr.us-east-1.amazonaws.com/jam/coordination-server:main`
- Auto deployments: enabled
- Health check: HTTP `GET /health` on port `8080`
- Runtime environment variables currently configured:
  - `AWS_REGION=us-east-1`
  - `JAM_AMI_ID=ami-0b694e8fc9890bec7`
  - `JAM_SECURITY_GROUP_ID=sg-092ad16c7428104a3`
  - `JAM_INSTANCE_TYPE=t3.medium`
  - `JAM_TAG_PREFIX=jam-`

Observed deployment result:

- App Runner service logs show:
  - image pulled successfully from ECR
  - instance provisioned
  - health check passed on `/health`
  - traffic routing started
- External verification:
  - `curl https://vjqmk2uvpa.us-east-1.awsapprunner.com/health`
  - response: `{"ok":true,"service":"jam-coordination"}`

Note: `describe-service` briefly continued to report `OPERATION_IN_PROGRESS` even after the health check succeeded and the public URL was already serving traffic.

## Repo Changes Landed For This Flow

These repo-side changes are pushed to `main` and are what produced the first ECR image:

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

The `coordination` server changes do the following:

- add `/health` for App Runner health checks
- move AWS/Jam runtime settings to env vars
- allow `BASE_URL` to be derived from the request origin when unset
- disable GitHub sign-in UI when OAuth secrets are not configured
- keep cookies secure-aware when served over HTTPS

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

## What Is Still Not Done

- Add `BASE_URL` to App Runner if the canonical URL should be pinned instead of derived from request origin
- Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to App Runner
- Configure the GitHub OAuth app callback URL to match the chosen public base URL
- Verify the live coordination server can assume `JamCoordinationServerInstanceRole` and launch Jam EC2 instances end-to-end
- Decide whether the default public App Runner URL will remain the canonical URL or whether a custom domain will be attached later

## Known Debugging History

- `GithubBryan` in App Runner was a false start and is not part of the final setup.
- The intended final model is ECR-backed App Runner, not GitHub-backed App Runner.
- Comparing against `RebelCodeBuild` was useful because it showed:
  - CodeBuild-hosted GitHub Actions runner projects use a normal `GITHUB` source plus a `WORKFLOW_JOB_QUEUED` webhook
  - the CodeBuild service role also needs CodeConnections permissions
  - the active CodeConnections GitHub connection must have access to the target repo owner
- The first GitHub Actions run reached CodeBuild and ECR login successfully, but failed at `docker build` because `FROM oven/bun:1` hit Docker Hub's unauthenticated pull-rate limit (`429 Too Many Requests`).
- The Dockerfile was then changed to use `public.ecr.aws/docker/library/debian:bookworm-slim` and install Bun explicitly, so future runs do not rely on Docker Hub for the base image.

## Next Likely Commands

Once OAuth details are known, the remaining App Runner update is expected to look like:

1. Create or update secrets for `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
2. Update App Runner runtime configuration to include:
   - `BASE_URL=https://vjqmk2uvpa.us-east-1.awsapprunner.com` or a future custom domain
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
3. Re-verify:
   - `/health`
   - GitHub login redirect flow
   - Jam EC2 launch path
