"use client";

/* ============================================================================ */
/* ------------------- Vote Modal Component ------------------- */
/* Modal for submitting votes on character applications */
/* ============================================================================ */

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui";

type VoteType = "approve" | "needs_changes";

interface VoteModalProps {
  characterId: string;
  characterName: string;
  currentVote?: {
    vote: VoteType;
    reason?: string | null;
    note?: string | null;
  } | null;
  initialVoteType?: VoteType;
  onVoteSubmitted: () => void;
  onClose: () => void;
  open: boolean;
}

export function VoteModal({
  characterId,
  characterName,
  currentVote,
  initialVoteType,
  onVoteSubmitted,
  onClose,
  open,
}: VoteModalProps) {
  const [voteType, setVoteType] = useState<VoteType>(
    currentVote?.vote || initialVoteType || "approve"
  );
  const [reason, setReason] = useState(currentVote?.reason || "");
  const [note, setNote] = useState(currentVote?.note || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setVoteType(currentVote?.vote || initialVoteType || "approve");
      setReason(currentVote?.reason || "");
      setNote(currentVote?.note || "");
      setError(null);
    }
  }, [open, currentVote, initialVoteType]);

  const handleSubmit = async () => {
    if (voteType === "needs_changes" && !reason.trim()) {
      setError("Reason is required for 'Needs Changes' votes");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/characters/${characterId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vote: voteType,
          reason: voteType === "needs_changes" ? reason.trim() : null,
          note: note.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit vote");
      }

      onVoteSubmitted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit vote");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title={`Vote on ${characterName}`}
      description={
        currentVote
          ? "Update your vote for this character application"
          : "Submit your vote for this character application"
      }
      size="md"
    >
      <div className="space-y-4">
        {/* Vote Type Selection */}
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--totk-light-ocher)]">
            Vote Type *
          </label>
          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="voteType"
                value="approve"
                checked={voteType === "approve"}
                onChange={(e) => {
                  setVoteType(e.target.value as VoteType);
                  setError(null);
                }}
                className="h-4 w-4 accent-[var(--totk-light-green)]"
              />
              <span className="text-sm text-[var(--botw-pale)]">Approve</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="voteType"
                value="needs_changes"
                checked={voteType === "needs_changes"}
                onChange={(e) => {
                  setVoteType(e.target.value as VoteType);
                  setError(null);
                }}
                className="h-4 w-4 accent-[#ff6347]"
              />
              <span className="text-sm text-[var(--botw-pale)]">
                Needs Changes
              </span>
            </label>
          </div>
        </div>

        {/* Reason Field (Required for Needs Changes) */}
        {voteType === "needs_changes" && (
          <div>
            <label
              htmlFor="reason"
              className="mb-2 block text-sm font-medium text-[var(--totk-light-ocher)]"
            >
              Feedback / Reason *{" "}
              <span className="text-xs text-[var(--totk-grey-200)]">
                (Required)
              </span>
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              placeholder="Provide feedback on what needs to be changed..."
              required
              rows={4}
              className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm text-[var(--botw-pale)] placeholder:text-[var(--totk-grey-300)] focus:border-[var(--totk-light-green)] focus:outline-none"
            />
          </div>
        )}

        {/* Note Field (Optional) */}
        <div>
          <label
            htmlFor="note"
            className="mb-2 block text-sm font-medium text-[var(--totk-light-ocher)]"
          >
            Note{" "}
            <span className="text-xs text-[var(--totk-grey-200)]">
              (Optional)
            </span>
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add any additional notes or comments..."
            rows={3}
            className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm text-[var(--botw-pale)] placeholder:text-[var(--totk-grey-300)] focus:border-[var(--totk-light-green)] focus:outline-none"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg border-2 border-red-500 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 overflow-hidden">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-4 py-2 text-sm font-medium text-[var(--botw-pale)] transition-colors hover:bg-[var(--totk-dark-green)]/20 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--totk-light-green)] px-4 py-2 text-sm font-medium text-[var(--botw-warm-black)] transition-all hover:bg-[var(--totk-light-green)]/90 hover:border-[var(--totk-light-green)] hover:shadow-[0_0_12px_rgba(73,213,156,0.5)] disabled:opacity-50"
          >
            {loading ? "Submitting..." : currentVote ? "Update Vote" : "Submit Vote"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
