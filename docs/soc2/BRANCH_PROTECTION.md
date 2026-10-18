# Branch protection, as code

The rules for `main` live in [.github/branch-protection.json](../../.github/branch-protection.json), in the exact shape GitHub's API takes. The evidence script compares the live settings with that file every time it runs (`github.branch_protection`). Change the rules by changing the file in a pull request, then apply it.

## What the file requires

| Setting | Value | Why |
| --- | --- | --- |
| Required status checks | `app`, `functions`, `database`, `security`, and the branch up to date with `main` | Nothing merges that CI hasn't passed on its final form |
| Pull request reviews | 1 approval, from a code owner; new commits dismiss old approvals; the last push needs its own approval | Someone other than the author reads every change, including the last one |
| Enforce for admins | On | The founder's own pushes follow the same rules; emergencies are handled as [emergency changes](policies/change-management.md#emergency-changes) |
| Force pushes, deletion | Off | History can't be rewritten or the branch removed |
| Conversation resolution | Required | Open review comments block the merge |

## Before it can be applied

1. **A plan that allows it.** GitHub refuses branch protection and rulesets on this private repository today: the API answers "Upgrade to GitHub Pro or make this repository public to enable this feature." The repository belongs to a personal account (`notlsz`), so GitHub Pro ($4 a month) is enough; moving it to an organization on GitHub Team costs $4 per user a month and adds team reviewers ([GitHub plans](https://docs.github.com/enterprise-cloud%40latest/github/getting-started-with-github/githubs-products); prices from [Capital and Compute, July 2026](https://capitalandcompute.net/blog/github-pricing-plans-cost/)).
2. **An author who isn't the approver.** AI coding agents push with the founder's credentials today, so their pull requests would be the founder's, and GitHub doesn't let an author approve their own pull request. Give the agents their own identity (a machine user invited as a collaborator with write access, or a GitHub App) and let them open pull requests as it. The founder then approves as the code owner.

Until the second step is done, apply the interim version below: everything except the approval.

## Applying it

With the GitHub CLI, signed in as a repository admin:

```sh
gh api -X PUT repos/notlsz/placetta/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input .github/branch-protection.json
```

The interim version, until AI agents have their own identity (checks, no force pushes, no approval yet):

```sh
jq '.required_pull_request_reviews.required_approving_review_count = 0
    | .required_pull_request_reviews.require_code_owner_reviews = false
    | .required_pull_request_reviews.require_last_push_approval = false' \
  .github/branch-protection.json \
  | gh api -X PUT repos/notlsz/placetta/branches/main/protection -H "Accept: application/vnd.github+json" --input -
```

The interim version will show as a difference ("0 approvals required, policy says 1") in every evidence bundle until the full file is applied. That's intended.

Check what's live:

```sh
gh api repos/notlsz/placetta/branches/main/protection
node scripts/soc2-evidence.mjs --out ~/placetta-evidence   # compares it with the file
```

## After applying it

1. Push a branch with a failing test and open a pull request: the merge button must stay blocked. Keep the screenshot as evidence.
2. Try `git push origin main` directly: GitHub must refuse it.
3. Add `SUPABASE_ACCESS_TOKEN` as a repository secret, so `deploy-functions.yml` actually deploys after CI on `main` ([change-management.md](policies/change-management.md)).
