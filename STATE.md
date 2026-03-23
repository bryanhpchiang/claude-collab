# Jam — State of Things
*Last updated: 2026-03-23*

## What's Happening Now
- Core infrastructure is stable: baked AMI, resilient EC2 UserData, DynamoDB for instance management
- GitHub OAuth is working; moving toward full end-to-end flow
- Focus: getting the lobby/reverse-proxy layer working to route sessions to their EC2 instances
- Ready to test real multi-session scenarios once proxy is functional

## What is Jam?
Multiplayer Claude Code. Go to letsjam.now, start a session, share a link, friends join and code together with Claude in real-time.

## Decisions Made
- **Name:** Jam (domain: letsjam.now, bought by Bryan)
- **Brand:** Fredoka font, orange-coral gradient (#ff9a56 → #ff6b6b), jam jar favicon
- **Infra:** All AWS. No Vercel, no third-party hosting.
- **Architecture:** Lobby EC2 (always-on) + per-session EC2 instances from AMI
- **AMI:** `ami-0b694e8fc9890bec7` — Ubuntu 22.04 + Bun + Node + Git + Claude CLI + Jam
- **Security group:** `sg-092ad16c7428104a3` — ports 22, 7681, 3000-9999 open
- **Auth:** GitHub OAuth (not built yet, day 2)
- **Two modes:** "Start from scratch" (empty VM) and "Bring a repo" (clone from GitHub)
- **Cloud-first:** Everything runs on AWS, users don't need local setup
- **VMs persist:** Friends can work on your project even when you're offline
- **IAM:** Use instance profiles in prod, not access keys

## What's Built
- [x] Multiplayer terminal (shared xterm.js + WebSocket)
- [x] Session management (create, join, list, rename)
- [x] Resume from disk with timestamps
- [x] Collapsible chat panel (input always visible)
- [x] Image paste upload
- [x] Smart scroll (tied to input focus)
- [x] Landing page (public/landing.html)
- [x] API routes (POST/GET/DELETE /api/jams, GET /j/:id)
- [x] System prompt with mediator role
- [x] EC2 AMI baked and ready

## What's In Progress
- [x] GitHub OAuth (implemented, integrated into auth flow)
- [x] Colorized usernames and mentions in terminal
- [x] DynamoDB-backed instance management + per-user limits
- [x] Resilient UserData script for EC2 boot
- [x] Dynamic path handling (removed hardcoded exe.dev references)
- [ ] Lobby server (serves landing page, provisions EC2s, reverse proxy)
- [ ] DNS setup (letsjam.now → lobby EC2)

## What's Next
- [ ] Reverse proxy (route /j/:id → correct EC2)
- [ ] Test full end-to-end flow: create session → launch EC2 → join from web
- [ ] Auto-hibernate idle VMs
- [ ] Usage limits / free tier caps
- [ ] @mentions with push notifications (Issue #1)
- [ ] Pinned messages + unread indicator (Issue #2)
- [ ] "State of things" sidebar in Jam UI

## Who's Doing What
- **Bryan:** Domain (letsjam.now), infra setup, SSH/proxy config
- **Sofiane:** AWS account, IAM, running EC2 commands
- **Liam:** Product direction, UX feedback, feature ideas
- **Claude:** Building everything else

## Key Resources
- **Repo:** https://github.com/bryanhpchiang/claude-collab
- **AMI:** ami-0b694e8fc9890bec7 (us-east-1)
- **Security Group:** sg-092ad16c7428104a3
- **Instance (base):** i-02e72b93dcde8d28b
- **Landing preview:** https://dog-tare.exe.xyz:3456 (when running)
