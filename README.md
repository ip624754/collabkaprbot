# STEP590C1 HOTFIX

Apply only over exact STEP590B:

```powershell
.\APPLY_STEP590C1.ps1 -ProjectRoot "C:\path\to\collabkaprbot-main"
```

The installer copies changed files and deletes `src/bot/adminWebAuthCallback.js`. No SQL or ENV changes are required.
