# Test Fixtures

Synthetic fixtures only. Do not copy production records into this directory.

## Rules

- Use synthetic farmers, buyers, devices, tenants, and credentials.
- Keep fixtures small and deterministic.
- Do not require network access for unit or service integration tests.
- Do not share mutable global fixtures across suites.
- Use temporary directories for filesystem scenarios; clean up test-owned files and processes.
- Never delete directories outside test-owned paths.
- Do not create financial fixtures with unapproved commission or payment assumptions.

Shared helpers may live here when multiple suites need the same synthetic values.
