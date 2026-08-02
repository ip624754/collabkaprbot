# Install STEP591 Product and Operations Rebaseline

Apply over exact parent commit `10042b52519ee043e812ea541e34c0c5ff39248e`. Use PATCH or HOTFIX, never both.

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run check:step591-rebaseline
npm.cmd run smoke:step591-rebaseline-contract
npm.cmd run check:architecture-gates
npm.cmd run preflight:source
npm.cmd run check:function-budget
git diff --check
```

Commit message:

```text
docs: rebaseline product and operations after step590
```

No deployment canary that mutates product state is required. After Vercel Ready, verify `/api/health` and `/admin`.
