import { AlertTriangle, FileText, Radio, RefreshCw, X } from "lucide-react";
import type { LiveRegulatoryFeed } from "@shared/types";
import { formatTimestamp } from "../lib/format";
import { SafeExternalLink } from "./EpistemicBadge";

interface RegulatoryModalProps {
  open: boolean;
  feed: LiveRegulatoryFeed | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClose: () => void;
}

export function RegulatoryModal({
  open,
  feed,
  loading,
  error,
  onRefresh,
  onClose,
}: RegulatoryModalProps) {
  if (!open) return null;

  const isDegraded = Boolean(error) || feed?.status === "degraded";

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reg-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-panel">
        <div className="modal-header">
          <div className="modal-title-group">
            <Radio size={16} aria-hidden="true" />
            <h2 id="reg-modal-title" className="modal-title">
              Federal Regulatory Pulse
            </h2>
            <span className="modal-count">Federal Register (FERC / DOE / EPA)</span>
          </div>

          <div className="modal-head-actions">
            <button
              type="button"
              className="live-refresh-btn"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw
                size={12}
                className={loading ? "spin" : ""}
                aria-hidden="true"
              />
              <span>{loading ? "Refreshing..." : "Refresh"}</span>
            </button>
            <button
              type="button"
              className="drawer-close-btn"
              onClick={onClose}
              aria-label="Close Federal Regulatory Pulse"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="modal-subbar">
          <div className="mono modal-subbar-meta">
            {feed?.fetchedAt
              ? `Updated ${formatTimestamp(feed.fetchedAt)}`
              : loading
                ? "Fetching Federal Register feed..."
                : "Feed pending"}
          </div>
          {feed?.sourceUrl && (
            <SafeExternalLink href={feed.sourceUrl} className="live-ext-link">
              Federal Register API
            </SafeExternalLink>
          )}
        </div>

        <div className="modal-body">
          {isDegraded && (
            <div className="degraded-banner" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              <div>
                <strong>Regulatory Feed Degraded:</strong>{" "}
                {error ||
                  feed?.error ||
                  "Unable to reach Federal Register API within timeout."}
              </div>
            </div>
          )}

          {loading && !feed && (
            <div className="modal-loading">Loading federal regulatory notices...</div>
          )}

          {feed && feed.items.length === 0 && !loading && (
            <div className="modal-empty">No recent regulatory items returned.</div>
          )}

          {feed && feed.items.length > 0 && (
            <ul className="reg-list">
              {feed.items.map((item) => (
                <li key={item.documentNumber} className="reg-item">
                  <div className="reg-item-meta">
                    <span className="reg-doc-num mono">{item.documentNumber}</span>
                    <span className="reg-type">{item.type}</span>
                    <span className="reg-date mono">{item.publicationDate}</span>
                  </div>

                  <h3 className="reg-item-title">
                    <SafeExternalLink href={item.htmlUrl}>
                      {item.title}
                    </SafeExternalLink>
                  </h3>

                  {item.agencies.length > 0 && (
                    <div className="reg-agencies">
                      {item.agencies.map((ag) => (
                        <span key={ag} className="reg-agency-pill">
                          {ag}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.abstract && (
                    <p className="reg-abstract">{item.abstract}</p>
                  )}

                  <div className="reg-item-links">
                    <SafeExternalLink href={item.htmlUrl} className="reg-link-btn">
                      Federal Register Page
                    </SafeExternalLink>
                    {item.pdfUrl && (
                      <SafeExternalLink href={item.pdfUrl} className="reg-link-btn">
                        <FileText size={11} aria-hidden="true" />
                        <span>PDF Filing</span>
                      </SafeExternalLink>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
