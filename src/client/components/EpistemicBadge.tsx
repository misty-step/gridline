import React from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import type {
  CatalogTier,
  EpistemicStatus,
  FootprintCoverage,
  LifecycleStatus,
} from "@shared/types";
import {
  CATALOG_TIER_LABELS,
  CATALOG_TIER_SHORT_LABELS,
  EPISTEMIC_LABELS,
  FOOTPRINT_COVERAGE_LABELS,
  LIFECYCLE_LABELS,
  safeHttpUrl,
} from "../lib/format";

export function StatusPill({
  status,
  compact = false,
}: {
  status: LifecycleStatus;
  compact?: boolean;
}) {
  return (
    <span
      className={`status-pill status-pill--${status}${compact ? " status-pill--compact" : ""}`}
      title={`Lifecycle: ${LIFECYCLE_LABELS[status]}`}
    >
      <span className={`status-glyph status-glyph--${status}`} aria-hidden="true" />
      <span>{LIFECYCLE_LABELS[status]}</span>
    </span>
  );
}

export function TierBadge({
  tier,
  compact = false,
}: {
  tier: CatalogTier;
  compact?: boolean;
}) {
  return (
    <span
      className={`tier-badge tier-badge--${tier}${compact ? " tier-badge--compact" : ""}`}
      title={CATALOG_TIER_LABELS[tier]}
    >
      {compact ? CATALOG_TIER_SHORT_LABELS[tier] : CATALOG_TIER_LABELS[tier]}
    </span>
  );
}

export function FootprintCoveragePill({
  coverage,
}: {
  coverage: FootprintCoverage;
}) {
  return (
    <span
      className={`coverage-pill coverage-pill--${coverage}`}
      title={FOOTPRINT_COVERAGE_LABELS[coverage]}
    >
      {coverage === "verified_polygons" ? "Traced footprint" : "Location only"}
    </span>
  );
}

export function EpistemicPill({ status }: { status: EpistemicStatus }) {
  return (
    <span
      className={`epistemic-pill epistemic-pill--${status}`}
      title={`Provenance tier: ${EPISTEMIC_LABELS[status]}`}
    >
      {EPISTEMIC_LABELS[status]}
    </span>
  );
}

export function SourceRefButton({
  sourceId,
  onJumpToSource,
  label = "source",
}: {
  sourceId: string;
  onJumpToSource?: (sourceId: string) => void;
  label?: string;
}) {
  if (!sourceId) return null;
  return (
    <button
      type="button"
      className="source-ref-btn mono"
      onClick={(e) => {
        e.stopPropagation();
        onJumpToSource?.(sourceId);
      }}
      title={`Inspect primary source ${sourceId}`}
      aria-label={`Jump to source ${sourceId}`}
    >
      {label}
    </button>
  );
}

export function SafeExternalLink({
  href,
  children,
  className = "ext-link",
  title,
  showIcon = true,
}: {
  href: string | null | undefined;
  children: React.ReactNode;
  className?: string;
  title?: string;
  showIcon?: boolean;
}) {
  const safe = safeHttpUrl(href);
  if (!safe) {
    return (
      <span className="ext-link-disabled" title="Unverified or missing external URL">
        <ShieldAlert size={12} aria-hidden="true" />
        <span>{children}</span>
      </span>
    );
  }
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={title ?? safe}
    >
      <span>{children}</span>
      {showIcon && <ExternalLink size={11} aria-hidden="true" />}
    </a>
  );
}
