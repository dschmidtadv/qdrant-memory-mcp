# GitHub PR Review Thread Resolution Skill

## Purpose
Resolve GitHub PR review threads (conversations) after code fixes have been applied, then wait for the reviewer to re-run and handle new threads. This is an **iterative cycle**, not a one-time action.

## When to Use
- After addressing PR review comments with code changes
- When you've posted explanatory replies to review findings
- Before waiting for the next review cycle
- Repeatedly until the reviewer approves with no new threads

## Critical Rules

### ✅ ALWAYS Use GraphQL
- The REST endpoint `PUT /repos/.../pulls/comments/{id}/resolve` returns **404** — it does NOT work
- GraphQL is the ONLY working method for resolving review threads
- Endpoint: `gh api graphql` with the mutation below

### ❌ Never Request Full Thread Objects
- Requesting `reviewThread { ... }` in the response fails
- The `ResolveReviewThreadPayload` has NO `reviewThread` field
- Return ONLY `clientMutationId` from the mutation

### ⚠️ NEVER Skip Thread Resolution
- Do NOT push code and declare the PR "done"
- Threads MUST be resolved via GraphQL mutations before the cycle is complete
- After resolving, wait for reviewer to run again
- Check for new threads and repeat if needed

## The Complete Workflow (Iterative Cycle)

### Cycle Round N

#### Step 1: Address Review Comments
Fix the code issues identified by the reviewer (Code mode)

#### Step 2: Commit and Push
```bash
git commit --amend
git push -f
```

#### Step 3: Post Explanatory Reply
```bash
gh pr comment <PR_NUMBER> -b "Addressed feedback in commit [hash]. Details: ..."
```

#### Step 4: Fetch Unresolved Thread IDs
```bash
gh api graphql -f query='
  query {
    repository(owner: "OWNER", name: "REPO") {
      pullRequest(number: N) {
        reviewThreads(first: 100) {
          nodes { id isResolved }
        }
      }
    }
  }
' | jq -r '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | .id'
```

**Output:** List of unresolved thread IDs (e.g., `PRRT_kwDOPGUiWc6t8l7r`)

#### Step 5: Resolve Each Thread with GraphQL Mutation
For each unresolved thread ID, run:
```bash
gh api graphql -f threadId="THREAD_ID" -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      clientMutationId
    }
  }
'
```

**Success indicator:** Response contains `"clientMutationId": "..."`

#### Step 6: Batch Loop (Recommended)
```bash
# Fetch all thread IDs
THREADS=$(gh api graphql -f query='
  query {
    repository(owner: "OWNER", name: "REPO") {
      pullRequest(number: N) {
        reviewThreads(first: 100) {
          nodes { id isResolved }
        }
      }
    }
  }
' | jq -r '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | .id')

# Resolve each one
RESOLVED=0
FAILED=0
for THREAD_ID in $THREADS; do
  if gh api graphql -f threadId="$THREAD_ID" -f query='
    mutation($threadId: ID!) {
      resolveReviewThread(input: {threadId: $threadId}) {
        clientMutationId
      }
    }
  ' | grep -q '"clientMutationId"'; then
    ((RESOLVED++))
    echo "✓ $THREAD_ID"
  else
    ((FAILED++))
    echo "✗ $THREAD_ID"
  fi
done

echo "Summary: $RESOLVED resolved, $FAILED failed"
```

#### Step 7: Verify All Resolved
```bash
gh api graphql -f query='
  query {
    repository(owner: "OWNER", name: "REPO") {
      pullRequest(number: N) {
        reviewThreads(first: 100) {
          nodes { id isResolved }
        }
      }
    }
  }
' | jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)'
```

**Success:** Empty output (no unresolved threads remaining)

#### Step 8: Wait for Re-Review
Stop here. Wait for the reviewer (Bedrock) to re-run and post new comments.

#### Step 9: Check for New Threads
After the reviewer responds, query again to check if new unresolved threads exist:
```bash
gh api graphql -f query='...' | jq -r '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | .id'
```

#### Step 10: Determine Next Action
- **If new threads found:** Go back to Step 1 (address new feedback)
- **If no new threads:** PR is clean and ready (or approved if reviewer allows merge)

## Real-World Example

From PR #73 (ai_content_studio contrib blockers):

```bash
# Step 4-6: Get and resolve all unresolved threads
THREADS=$(gh api graphql -f query='
  query {
    repository(owner: "<ORG>", name: "drupal-ai") {
      pullRequest(number: 73) {
        reviewThreads(first: 100) {
          nodes { id isResolved }
        }
      }
    }
  }
' | jq -r '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | .id')

RESOLVED=0
FAILED=0
for THREAD_ID in $THREADS; do
  if gh api graphql -f threadId="$THREAD_ID" -f query='
    mutation($threadId: ID!) {
      resolveReviewThread(input: {threadId: $threadId}) {
        clientMutationId
      }
    }
  ' | grep -q '"clientMutationId"'; then
    ((RESOLVED++))
    echo "✓ $THREAD_ID"
  else
    ((FAILED++))
    echo "✗ $THREAD_ID"
  fi
done
echo "Summary: $RESOLVED resolved, $FAILED failed"

# Step 7: Verify all resolved
gh api graphql -f query='
  query {
    repository(owner: "<ORG>", name: "drupal-ai") {
      pullRequest(number: 73) {
        reviewThreads(first: 100) {
          nodes { id isResolved }
        }
      }
    }
  }
' | jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)'

# Output: (empty - all resolved)
# Step 8: WAIT for reviewer to run again
# Step 9: Check for new threads after reviewer responds
```

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Pushing code and skipping GraphQL resolution | Threads remain open, PR incomplete | Always execute Steps 4-7 |
| Not waiting for re-review | Miss new feedback cycles | Wait after Step 7 before checking again |
| Using REST endpoint | 404 Not Found | Use GraphQL only |
| Requesting `reviewThread { ... }` in mutation response | GraphQL error | Return only `clientMutationId` |
| Forgetting to query threads first | Guess and check (inefficient) | Always fetch IDs before resolving |
| Not verifying resolution | Silent failure possible | Run verification query after batch |
| Hardcoding thread IDs | Breaks for different PRs | Always use dynamic queries |
| Treating as one-time task | Incomplete workflow | Remember: Resolve → Wait → Check → Repeat |

## Integration with Git Ops Workflow

**This is an iterative cycle, not a linear process:**

1. **Address review comments** (Code mode fixes)
2. **Commit and push** (git commit --amend && git push -f)
3. **Post explanatory comment** (gh pr comment)
4. **Resolve review threads with GraphQL** (Steps 4-7 of this skill) ← CRITICAL
5. **Verify PR is clean** (no unresolved threads)
6. **WAIT for reviewer to re-run** ← DO NOT SKIP
7. **Check for new threads** (Step 9)
8. **If new threads:** Go back to Step 1 (repeat cycle)
9. **If no new threads:** PR is approved or ready

## Triggering the Iterative Review Cycle

### How to Request Bedrock Reviewer to Re-Run

After resolving all threads (Step 7), you need to **request the reviewer to re-run**. Bedrock does NOT automatically re-review when threads are resolved.

#### Option 1: Request Re-Review via Comment (Recommended)
Post a comment on the PR explicitly requesting Bedrock to review again:

```bash
gh pr comment <PR_NUMBER> -b "@bedrock please review the latest changes"
```

Or with more detail:
```bash
gh pr comment <PR_NUMBER> -b "All threads have been resolved and code has been updated. @bedrock please perform a fresh review of the changes."
```

#### Option 2: Dismiss Previous Review
If Bedrock has already submitted a review (not just comments), you may need to dismiss the review first:

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/reviews/{review_id} -X PUT -f event=DISMISS
```

Then request re-review via comment.

#### Option 3: Trigger via Code Push (Automatic)
Sometimes a force push (`git push -f`) automatically triggers reviewers to re-run, but this is NOT guaranteed with Bedrock. Always follow up with Option 1.

### After Requesting Re-Review

1. Wait for Bedrock to respond (this may take seconds to minutes)
2. Run Step 9 to check for new threads
3. If new threads appear, go back to Step 1
4. If no new threads, PR is clean and ready

### Complete Example Flow

```bash
# After resolving all threads...

# Request re-review
gh pr comment 73 -b "@bedrock please review the latest changes"

# Wait for Bedrock to respond (check GitHub UI or run every 30 seconds)

# Check for new unresolved threads
gh api graphql -f query='
  query {
    repository(owner: "<ORG>", name: "drupal-ai") {
      pullRequest(number: 73) {
        reviewThreads(first: 100) {
          nodes { id isResolved }
        }
      }
    }
  }
' | jq -r '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | .id'

# If output is empty → PR is clean
# If output has thread IDs → Go back to Step 1 and address new feedback
```

## Troubleshooting

### "GraphQL: Could not resolve to a ReviewThread"
- Thread ID is malformed or already resolved
- Run Step 4 again to get current unresolved threads

### "No mutations matching name 'resolveReviewThread'"
- GraphQL query syntax error
- Verify exact spelling and structure of mutation (case-sensitive)

### Threads still showing unresolved after mutation
- Response did not contain `clientMutationId` (check for errors in response)
- Thread was already resolved (fetch fresh list)
- Insufficient permissions (check token scope)

### Pushed code but threads show as still unresolved
- You did not run the GraphQL mutations (Steps 4-7)
- This is not automatic — you MUST execute them
- Run the batch loop now to resolve

## References
- GitHub GraphQL API: https://docs.github.com/en/graphql
- ReviewThread type: https://docs.github.com/en/graphql/reference/types#reviewthread
- resolveReviewThread mutation: https://docs.github.com/en/graphql/reference/mutations#reviewthreadresolve
