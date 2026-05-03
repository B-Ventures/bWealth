# Security Specification for bWealth

## 1. Data Invariants
- A User document can only be created/modified by the authenticated user matching the `userId`.
- Beneficiaries, Deposits, RecurringConfigs, and GoldInvestments are private to the user who owns the parent `/users/{userId}` document.
- Sub-resources must verify that the user accessing them is the owner of the parent user document.
- `beneficiaryId` in sub-resources must refer to a valid beneficiary belonging to that user.
- Timestamps like `createdAt` and `updatedAt` must be server-generated.

## 2. The "Dirty Dozen" Payloads (Denial Expected)
1. **Identity Theft**: Creating a beneficiary under another user's path.
2. **Shadow Field**: Adding `isAdmin: true` to a user profile.
3. **Ghost Write**: Updating a deposit status without owning the user account.
4. **ID Poisoning**: Injecting a 2KB string as a beneficiary ID.
5. **PII Leak**: Reading all users' profiles (blanket read).
6. **Timeline Hijack**: Setting `createdAt` to a date in the past.
7. **Type Inconsistency**: Sending a string for `amount`.
8. **Negative Deposit**: Sending a negative `amount` for a deposit.
9. **Orphaned Deposit**: Creating a deposit with a non-existent `beneficiaryId`.
10. **State Shortcutting**: Updating a terminal status (if we had one, but we use strict keys).
11. **Large Payload**: Sending a 1MB notes field to exhaust storage/bandwidth.
12. **Self-Promotion**: Trying to set `role: 'admin'` in user doc.

## 3. The Test Runner (Plan)
We will use `@firebase/rules-unit-testing` logic (conceptually) to ensure:
- `auth != null`
- `request.auth.uid == userId`
- `isValidId(id)` checks pass.
- `affectedKeys().hasOnly()` guards updates.
