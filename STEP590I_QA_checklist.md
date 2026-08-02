# STEP590I QA Checklist

- [ ] package/package-lock parity is `1.3.38`
- [ ] architecture manifest parses
- [ ] queries façade remains under 420 lines and SQL-free
- [ ] cron façade remains under 40 lines and delegates only to jobs index
- [ ] five QStash routes delegate to exact owners
- [ ] bounded repository/job directories contain required owner files
- [ ] admin-web entry remains under 2500 lines
- [ ] admin HTML keeps one module entry
- [ ] moved frontend declarations do not return to entry
- [ ] view modules do not call API/fetch directly
- [ ] mutation tests prove gates fail closed
- [ ] preflight:source includes all STEP590I gates
- [ ] critical spine passes
- [ ] function budget remains unchanged
- [ ] PATCH/HOTFIX/FULL parity passes
