# Security Specification & Threat Model — COPAÇO no Quinteiro

This document outlines the zero-trust data invariants and specifies the threat models against privilege escalation, denial of wallet, and PII scrapers.

## 1. Zero-Trust Data Invariants

1. **Reservation PII Protection**: The `reservations` collection contains sensitive personally identifiable information (PII) including full names, telephone numbers, and booking allocations. Public users can ONLY query the `availability` collection which contains absolutely no PII.
2. **Double Booking Prevention**: To prevent race-conditions and multiple clients booking the same table simultaneously, every write must atomically create/reserve a corresponding unique, composite ID in the `availability` collection formatted as `${gameId}_${tableType}_${tableNumber}`.
3. **Admin Verification integrity**: System administrators must login via authenticated Google Sign-In, and are validated via secure lookup of their `uid` in the `/admins/{adminId}` collection or verified custom claims. Hardcoded emails and client-side privilege assertions are strictly prohibited.
4. **Temporal Consistency**: Timestamp fields (`createdAt`, `updatedAt`) must rely strictly on `request.time` on the server-side, preventing clients from spoofing timeline dates.

---

## 2. The "Dirty Dozen" Threat Payloads (Test Suite Design)

The following payloads represent malicious JSON inputs evaluated against the rules:

| Payload ID | Targeted Collection | Vulnerability / Attack Vector | Payload / Action Details | Expected Result |
|---|---|---|---|---|
| **P-01** | `reservations` | Public Scrape Attack | Attempting a query to list all records without authentication. | `PERMISSION_DENIED` |
| **P-02** | `reservations` | Identity Hijacking | Creating a reservation with user owner headers spoofed as another guest. | `PERMISSION_DENIED` |
| **P-03** | `reservations` | Resource Poisoning | Injecting a 2MB junk string into `clientName` or `clientPhone`. | `PERMISSION_DENIED` |
| **P-04** | `reservations` | Privilege Escalation | Attempting to create an active reservation with status `"confirmado"` for a Brazil Game without admin role or payment. | `PERMISSION_DENIED` |
| **P-05** | `reservations` | State Shortcutting | Changing status directly to `"liberada automaticamente"` for a high-priority Brazil Game, or changing a finished state back to pending. | `PERMISSION_DENIED` |
| **P-06** | `reservations` | Backdoor Admin Claim | Authenticating with a spoofed email to bypass `isAdmin()` checks. | `PERMISSION_DENIED` |
| **P-07** | `availability` | Double Registration | Creating a table availability document for a table that has already been registered (`exists` check failure). | `PERMISSION_DENIED` |
| **P-08** | `blockedTables` | Admin Spoofing | Attempting to block a seat without admin status. | `PERMISSION_DENIED` |
| **P-09** | `settings` | Layout Defacement | Attempting to modify homepage text/settings without authenticated admin credentials. | `PERMISSION_DENIED` |
| **P-10** | `games` | Event Sabotage | Normal user trying to delete or modify a scheduled game. | `PERMISSION_DENIED` |
| **P-11** | `admins` | Self-promotion Attack | Writing directly to the `admins` collection to elevate oneself. | `PERMISSION_DENIED` |
| **P-12** | `reservations` | Orphaned Resource Creation | Attempting to create a reservation referencing a game ID that does not exist. | `PERMISSION_DENIED` |

---

## 3. Storage Security Constraints
- **MIME Type**: Must match `image/.*`.
- **File Size**: Strict limit of `5MB` (`5 * 1024 * 1024` bytes).
- **Access Policy**: Read operations are public; write operations require authenticating as a verified admin.
