# Local-only, single-user, no authentication

The app is a personal tracker used by one person and by AI agents acting for them, so it has no login, accounts or permissions. That is only safe because it runs on localhost and is never deployed or exposed to a network; anything that changes that constraint must add authentication first.

How the app enforces local-only (listen address, socket check, Host check, Origin check) is recorded in ADR 0022.
