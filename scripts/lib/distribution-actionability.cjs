'use strict';

// Distribution Intelligence v2 — actionability.
//
// v1 answered "where should this business be promoted?". This answers the
// different question an employee actually has on Monday morning: "what exactly
// do I do next, where, and how sure are we?"
//
// ── THE AUDIT CAME FIRST, AND IT ADDS ZERO STORED FIELDS ────────────────────
//
// Every operational concept the brief asked for already has a canonical home:
//
//   CONCEPT                 CANONICAL FIELD                          COVERAGE
//   action                  listingAction / marketplaceType+          32/1563 dirs
//                           sellerTypes / opportunityTypes            all mp, all media
//   action URL              submissionUrl, claimUrl, pitchUrl,        139 / 2234
//                           pressReleaseUrl, advertisingUrl
//   cost                    submissionModel / costModel               48 dirs, all others
//   verification            verificationMethods (VERIFICATION_METHODS) 2 / 1563
//   required assets         requiredAssets (REQUIRED_ASSET_KEYS)      77 / 1563
//   difficulty              submissionDifficulty (SUBMISSION_DIFFICULTY) 36 / 1563
//   moderation              intelligence.approvalMode,                31 dirs, 62 media
//                           requiresEditorialApproval
//   geography               country / audienceGeography / countryReach full
//   languages               languages                                 media only
//   eligibility             listingAction: invite-only + prose        sparse
//
// So the gap is EVIDENCE, not schema. Adding `publishingTime` or
// `accountRequired` columns would have produced 2,234 empty cells and a
// dashboard reporting how many fields exist rather than how much is known.
//
// ── WHERE THE DERIVATION ITSELF LIVES ───────────────────────────────────────
//
// In dp-engine.cjs, with the rest of the planner's decision logic, because the
// browser needs it too: the campaign the page recomputes on every control change
// is ranked by readiness, and a second copy of this state machine running in the
// client is precisely how a page starts calling something Ready that the CSV
// export calls Needs research. This module is the server-side name for that
// engine and re-exports it unchanged.

const S = require('./media-schema.cjs');
const E = require('./dp-engine.cjs');

module.exports = {
  EVIDENCE: E.EVIDENCE,
  STATUS: E.STATUS,
  STATUS_LABEL: E.STATUS_LABEL,
  CONFIDENCE: E.CONFIDENCE,
  CONFIDENCE_LABEL: E.CONFIDENCE_LABEL,
  NEXT_ACTION: E.NEXT_ACTION,
  DIFFICULTY_LABEL: E.DIFFICULTY_LABEL,
  PUBLISHING_TIME: E.PUBLISHING_TIME,
  actionability: E.actionability,
  requirementsFor: E.requirementsFor,
  blockersFor: E.blockersFor,
  urlMatchesAction: E.urlMatchesAction,
  health: E.health,
  compareStable: S.compareStable,
};
