# Runbook: protect `main` and require reviewed, tested changes

| | |
| --- | --- |
| Who runs it | The founder, signed in to GitHub as the repository admin |
| Time | 2 to 3 hours the first time, most of it setting up the bot identity |
| Cost | GitHub Pro, $4 a month, for the `notlsz` account (or an organization on GitHub Team) |
| Closes | SOC 2 CC8.1b, CC3.4a, CC5.2a; ISO/IEC 27001:2022 A.8.32, A.8.4, A.5.3; FedRAMP CM-3, AC-5 |
| Status on 2026-10-22 | **Not done.** GitHub refuses branch protection on this private repository on the current plan, and AI coding sessions push with the founder's credentials |

Nothing in this runbook was run by Claude. Every command changes live GitHub settings, so the founder runs it.

## Why the order matters

GitHub never lets the author of a pull request approve it. Today AI coding agents push as the founder, so every pull request they open would be the founder's own, and turning on "1 approval required" would block all work. The order below fixes identity first, then turns on the rules.

## Step 1. Upgrade the plan

GitHub, Settings, Billing and plans, upgrade the `notlsz` account to **Pro**. Check it worked:

```sh
gh api repos/notlsz/placetta/branches/main/protection 2>&1 | head -3
# Before: "Upgrade to GitHub Pro or make this repository public to enable this feature."
# After:  "Branch not protected" (HTTP 404), which means the feature is now available
```

## Step 2. Give AI coding sessions their own GitHub identity

1. Create a separate GitHub account for automation, for example `placetta-bot`, on a company address you control (for example `bot@placetta.com`). Turn on two-step sign-in for it with a security key or passkey, and keep its recovery codes in the company password manager.
2. Invite it to the repository with write access, and nothing more:

   ```sh
   gh api -X PUT repos/notlsz/placetta/collaborators/placetta-bot -f permission=push
   ```

   Accept the invitation while signed in as the bot.
3. While signed in as the bot, create a **fine-grained personal access token** limited to `notlsz/placetta`, expiring in 90 days, with: Contents read and write, Pull requests read and write, Workflows read and write (only needed when a session edits `.github/workflows/`), Metadata read. No other scopes.
4. Give AI coding sessions **only** this token. Remove the founder's own GitHub credentials from every environment an AI session can reach (the Claude Code environment, any `.env`, any credential helper).
5. Sessions commit as the bot: `git -c user.name=placetta-bot -c user.email=<bot-id>+placetta-bot@users.noreply.github.com commit ...`. The commit author name is only metadata; what GitHub records as the pull request's author is the account that owns the token, which is why step 3 matters.
6. Record it in the access register ([docs/soc2/records/access-review-template.md](../records/access-review-template.md)): the bot, its owner (the founder), its scopes and the token's expiry. Rotate the token before it expires.

## Step 3. Apply the protection rules

The rules live in [.github/branch-protection.json](../../../.github/branch-protection.json): the four CI jobs (`app`, `functions`, `database`, `security`) must pass on an up-to-date branch, one approval from a code owner ([.github/CODEOWNERS](../../../.github/CODEOWNERS)), stale approvals dismissed, the last push re-approved, conversations resolved, no force pushes or deletion, and **enforced for admins**.

From the repository root, signed in as the admin:

```sh
gh api --method PUT repos/notlsz/placetta/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  --input .github/branch-protection.json
```

The four check names must have run at least once on a pull request before GitHub can match them; CI runs on every pull request, so open any pull request first if the call complains about unknown checks.

If you have to protect `main` before step 2 is finished, apply the interim version (checks and no force pushes, no approval yet), and come back to the full command as soon as the bot exists:

```sh
jq '.required_pull_request_reviews.required_approving_review_count = 0
    | .required_pull_request_reviews.require_code_owner_reviews = false
    | .required_pull_request_reviews.require_last_push_approval = false' \
  .github/branch-protection.json \
  | gh api --method PUT repos/notlsz/placetta/branches/main/protection \
      -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" --input -
```

## Step 4. Check it, and keep the evidence

```sh
gh api repos/notlsz/placetta/branches/main/protection \
  --jq '{checks: [.required_status_checks.checks[].context], strict: .required_status_checks.strict,
         approvals: .required_pull_request_reviews.required_approving_review_count,
         code_owners: .required_pull_request_reviews.require_code_owner_reviews,
         last_push: .required_pull_request_reviews.require_last_push_approval,
         admins: .enforce_admins.enabled, force_pushes: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled}'
```

Expected: `checks` lists `app`, `functions`, `database`, `security`; `strict` true; `approvals` 1; `code_owners` true; `last_push` true; `admins` true; `force_pushes` false; `deletions` false.

Then prove it works, and save each result (screenshot or terminal output, dated) in the evidence folder:

1. `git push origin main` from a local clone: GitHub must refuse it.
2. A pull request from the bot with a deliberately failing test: the merge button must stay blocked.
3. The same pull request with the test fixed: still blocked until the founder approves.
4. Run `node scripts/soc2-evidence.mjs --out ~/placetta-evidence` with a `GITHUB_TOKEN`; `github.branch_protection` must report no difference from the file.

## Step 5. Deploy only from CI

1. Create a Supabase access token for deploys (supabase.com/dashboard/account/tokens) and store it as a repository secret. It is never pasted into a terminal history or a chat:

   ```sh
   gh secret set SUPABASE_ACCESS_TOKEN --repo notlsz/placetta   # paste at the prompt
   ```

2. Set the Supabase connector used by AI coding sessions to **read-only**, so production changes go through `main` and [.github/workflows/deploy-functions.yml](../../../.github/workflows/deploy-functions.yml) only.
3. From then on, migrations and function deploys from the dashboard, the CLI or an MCP connector are **emergency changes** ([change-management.md](../policies/change-management.md#emergency-changes)) and need a record.

## A solo founder needs a second approver, or an approved compensating control

With the bot identity, the founder approves what AI sessions write. That covers most changes. It does not cover a change the **founder** writes: GitHub won't let the founder approve their own pull request, and with `enforce_admins` on, the founder can't merge it alone. Pick one of these and write the choice into [change-management.md](../policies/change-management.md) when approving that policy:

1. **A second approver (preferred by auditors).** Add an outside reviewer (a technical advisor, an investor's engineer or a paid contractor under NDA) as a collaborator with write access, and add them to `.github/CODEOWNERS` next to `@notlsz`. Founder-written pull requests wait for their approval. Record their access in the quarterly access review.
2. **A compensating control, approved before the audit window starts.** If no second person is available:
   1. The founder writes changes on a branch and the **bot** opens the pull request, so the founder reviews the final diff as approver, with CI as the independent test gate. This is review by the same person, and an auditor will treat it as weaker than option 1.
   2. Every month, an independent person (an advisor or investor) reviews the list of pull requests merged that month (`gh pr list --state merged --search "merged:>=YYYY-MM-01"`), samples at least five, and signs the monthly review record in [RECORDS.md](../RECORDS.md).
   3. The control is written down, approved by the founder, and **shown to the auditor during scoping**. An auditor may still report it as an exception; ask before the observation window starts.

Never turn off `enforce_admins` to get a change through. If production is down, follow the emergency change steps and open the pull request afterwards.

## Undo

Removing protection is itself a change that needs a record:

```sh
gh api --method DELETE repos/notlsz/placetta/branches/main/protection
```

## Record

| Date | Step | Result | Evidence file | By |
| --- | --- | --- | --- | --- |
| | Plan upgraded | | | |
| | Bot identity created, token scoped, founder credentials removed from AI environments | | | |
| | Protection applied (full or interim) | | | |
| | Direct push refused; failing PR blocked; approval required | | | |
| | `SUPABASE_ACCESS_TOKEN` secret set; connector read-only | | | |
| | Second approver named, or compensating control approved | | | |
