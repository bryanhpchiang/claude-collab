# AWS Coordination Server Context

Provisional notes for the Jam coordination-server deployment. This file is intended to be updated as the remaining AWS setup is completed.

## Purpose

The target deployment flow is:

1. GitHub Actions runs on a CodeBuild-hosted runner.
2. That workflow builds `lobby/Dockerfile`.
3. The workflow pushes the image to ECR.
4. App Runner tracks the stable ECR tag and auto-deploys the coordination server.

This is for the `lobby/` service in this repo.

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
- Current image state: no images pushed yet

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

These values are already established elsewhere and are intended to be passed into App Runner:

- Jam base AMI: `ami-0b694e8fc9890bec7`
- Jam security group: `sg-092ad16c7428104a3`
- Jam instance tag prefix: `jam-`
- Default Jam instance type currently expected in local code: `t3.medium`

### App Runner

- `JamCoordinationServer` App Runner service has not been created yet.
- No Jam coordination-server App Runner service exists in `aws apprunner list-services` as of this snapshot.

## Repo Changes Prepared For This Flow

These repo-side changes exist locally and are intended to support the deployment flow above:

- Added `.github/workflows/deploy-coordination-server.yml`
- Updated `lobby/Dockerfile`
- Updated `lobby/server.ts`

The workflow expects:

- CodeBuild project name: `JamCoordinationServerRunner`
- ECR repo name: `jam/coordination-server`
- Stable deploy tag: `main`

The `lobby/server.ts` changes do the following:

- add `/health` for App Runner health checks
- move AWS/Jam runtime settings to env vars
- allow `BASE_URL` to be derived from the request origin when unset
- disable GitHub sign-in UI when OAuth secrets are not configured
- keep cookies secure-aware when served over HTTPS

## What Is Still Not Done

- Push the local repo changes to GitHub `main`
- Let GitHub Actions run on the CodeBuild-hosted runner
- Push the first image to `jam/coordination-server`
- Create the `JamCoordinationServer` App Runner service
- Add `BASE_URL`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET` to App Runner
- Verify App Runner can assume `JamCoordinationServerInstanceRole` and launch Jam EC2 instances correctly

## Known Debugging History

- `GithubBryan` in App Runner was a false start and is not part of the final setup.
- The intended final model is ECR-backed App Runner, not GitHub-backed App Runner.
- Comparing against `RebelCodeBuild` was useful because it showed:
  - CodeBuild-hosted GitHub Actions runner projects use a normal `GITHUB` source plus a `WORKFLOW_JOB_QUEUED` webhook
  - the CodeBuild service role also needs CodeConnections permissions
  - the active CodeConnections GitHub connection must have access to the target repo owner

## Next Commands From Here

The next high-level steps are:

1. Commit and push the local repo changes.
2. Confirm GitHub Actions pushes `main` into ECR.
3. Create App Runner pointing at `757208469216.dkr.ecr.us-east-1.amazonaws.com/jam/coordination-server:main`.
4. Add OAuth secrets and canonical `BASE_URL`.

This file should be updated once those steps are completed so future agents do not have to reconstruct the state again.
