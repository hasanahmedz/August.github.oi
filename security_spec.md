# Security Specification — J.A.R.V.I.S. / August Hardened Firestore Rules

## 1. Data Invariants
1. Every document under `/users/{userId}` and all subcollections (`memories`, `tasks`, `history`, `monitors`, `knowledgeDocs`, `knowledgeChunks`, `integrations`, `auditLogs`, `skills`, `skills/{skillId}/versions`, `projects`, `bugReports`, `creativeAssets`, `contacts`, `callLogs`, `workflows`, `agentRuns`) requires `request.auth != null`, `request.auth.token.email_verified == true`, and `request.auth.uid == userId`.
2. Every document embeds immutable `userId == request.auth.uid`.
3. Every path variable (`userId`, `skillId`, `versionId`, `projectId`, `reportId`, `assetId`, `contactId`, `callId`, `workflowId`, `runId`, etc.) must pass `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, length 1..128) on single-document operations (`get`, `create`, `update`, `delete`).
4. Subcollection Master Gates:
   - `knowledgeChunks` requires parent `knowledgeDocs/{docId}` to exist.
   - `skills/{skillId}/versions/{versionId}` requires parent `skills/{skillId}` to exist and stays immutable (`allow update: if false`).
   - `auditLogs` and `callLogs` are immutable (`allow update: if false`).
5. Temporal Integrity: `createdAt`, `updatedAt`, and `lastRunAt` must equal `request.time` (`serverTimestamp()`) on creation/mutation, and `createdAt` is immutable on updates.
6. Strict Keys & Size Bounds: Every write enforces `hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` + full `isValid*` on update, and explicit `.size()` bounds on every string and array field matching `firebase-blueprint.json`.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read/list/write on `/users/{userId}/contacts/{id}` or `/users/{userId}/skills/{id}`.
2. Cross-tenant access: User A attempting `get`/`list`/`write` on `/users/{userB}/projects/{id}`.
3. Unverified email (`email_verified == false`) attempting to create a skill or workflow.
4. Spoofed `userId` field in payload (`incoming().userId != request.auth.uid`).
5. Shadow update adding ghost field (e.g., `isAdmin: true`, `bypassGate: true`) to `skills` or `contacts`.
6. Oversized document ID (`> 128` chars) or path traversal characters.
7. Denial of Wallet: `creativeAssets.specJson` exceeding 16,000 bytes or `skills.instructions` exceeding 4,000 bytes.
8. Forged client timestamp (`createdAt != request.time` or mutating `createdAt` on update).
9. Mutating immutable `skillId` on `versions` or attempting `update` on `callLogs` / `auditLogs`.
10. Invalid enum value (e.g., `creativeAssets.dimension: "4d"`, `contacts.source: "scraped"`).
11. Orphaned `SkillVersion` create pointing to a nonexistent `skills/{skillId}` parent document.
12. Query trust bypass: omitting owner constraint or attempting `allow list` without `resource.data.userId == request.auth.uid`.
