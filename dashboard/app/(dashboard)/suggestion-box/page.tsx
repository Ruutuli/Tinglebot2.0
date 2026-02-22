"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/hooks/use-session";

type Category = "feature" | "improvement" | "bug" | "event" | "other";

interface FormState {
  category: Category;
  title: string;
  description: string;
}

export default function SuggestionBoxPage() {
  const { user, loading: sessionLoading } = useSession();
  const [formState, setFormState] = useState<FormState>({
    category: "feature",
    title: "",
    description: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charCount = formState.description.length;
  const maxChars = 1000;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError("You must be logged in to submit suggestions.");
      return;
    }

    if (!formState.title.trim()) {
      setError("Please enter a title for your suggestion.");
      return;
    }

    if (!formState.description.trim()) {
      setError("Please enter a description for your suggestion.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          category: formState.category,
          title: formState.title.trim(),
          description: formState.description.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit suggestion");
      }

      setShowModal(true);
      setFormState({
        category: "feature",
        title: "",
        description: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFormState({
      category: "feature",
      title: "",
      description: "",
    });
    setError(null);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showModal) {
        closeModal();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showModal]);

  if (sessionLoading) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-[var(--totk-light-green)] mb-4 block" />
          <p className="text-[var(--botw-pale)]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3 md:gap-4">
        <img alt="" className="h-4 w-auto sm:h-5 md:h-6" src="/Side=Left.svg" />
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[var(--totk-light-green)]">
          Suggestion Box
        </h1>
        <img alt="" className="h-4 w-auto sm:h-5 md:h-6" src="/Side=Right.svg" />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {!user ? (
          /* Login Required State */
          <div className="flex-1 flex items-center justify-center">
            <div
              className="rounded-xl p-8 md:p-12 text-center backdrop-blur-sm max-w-2xl w-full"
              style={{
                background: "linear-gradient(135deg, rgba(88, 101, 242, 0.1), rgba(88, 101, 242, 0.05))",
                border: "2px solid rgba(88, 101, 242, 0.3)",
              }}
            >
              <div className="text-6xl text-[#5865F2] mb-6">
                <i className="fab fa-discord" />
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-totk-ivory mb-4">
                Login Required
              </h3>
              <p className="text-botw-pale mb-2 text-lg">
                You must be logged in with Discord to submit suggestions.
              </p>
              <p className="text-botw-pale mb-8">
                This helps us ensure suggestions come from verified server members while keeping them anonymous.
              </p>
              <a
                href="/api/auth/discord"
                className="inline-flex items-center gap-3 px-8 py-4 rounded-lg font-semibold text-white text-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                style={{
                  background: "#5865F2",
                  boxShadow: "0 4px 20px rgba(88, 101, 242, 0.4)",
                }}
              >
                <i className="fab fa-discord text-xl" />
                Login with Discord
              </a>
              <div className="mt-10 pt-8 border-t border-[rgba(88,101,242,0.2)] grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="flex flex-col items-center gap-2">
                  <i className="fas fa-shield-alt text-2xl text-totk-light-green" />
                  <span className="text-botw-pale text-sm">Verified Members Only</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <i className="fas fa-user-secret text-2xl text-totk-light-green" />
                  <span className="text-botw-pale text-sm">Posted Anonymously</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <i className="fas fa-comments text-2xl text-totk-light-green" />
                  <span className="text-botw-pale text-sm">Staff Will Respond</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Logged In - Show Form and Info side by side */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-6" style={{ minHeight: "500px" }}>
            {/* Form Section - 3/4 width */}
            <div
              className="rounded-xl p-6 backdrop-blur-sm flex flex-col h-full"
              style={{
                background: "rgba(32, 36, 44, 0.72)",
                border: "1px solid var(--totk-dark-ocher)",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
              }}
            >
              <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-4">
                {/* Title - Full width */}
                <div className="flex flex-col gap-2">
                  <label htmlFor="title" className="font-semibold text-totk-ivory">
                    Title
                  </label>
                  <input
                    type="text"
                    id="title"
                    placeholder="Brief summary of your suggestion..."
                    maxLength={100}
                    value={formState.title}
                    onChange={(e) =>
                      setFormState({ ...formState, title: e.target.value })
                    }
                    className="w-full p-3 rounded-lg text-botw-pale transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]"
                    style={{
                      background: "rgba(26, 22, 21, 0.9)",
                      border: "2px solid var(--totk-dark-ocher)",
                    }}
                  />
                </div>

                {/* Category */}
                <div className="flex flex-col gap-2">
                  <label htmlFor="category" className="font-semibold text-totk-ivory">
                    Category
                  </label>
                  <select
                    id="category"
                    value={formState.category}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        category: e.target.value as Category,
                      })
                    }
                    className="w-full p-3 rounded-lg text-botw-pale transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]"
                    style={{
                      background: "rgba(26, 22, 21, 0.9)",
                      border: "2px solid var(--totk-dark-ocher)",
                    }}
                  >
                    <option value="feature">✨ New Feature</option>
                    <option value="improvement">🔧 Improvement</option>
                    <option value="bug">🐛 Bug Report</option>
                    <option value="event">🎉 Event Idea</option>
                    <option value="other">💭 Other</option>
                  </select>
                </div>

                {/* Description - Takes remaining space */}
                <div className="flex-1 flex flex-col gap-2">
                  <label htmlFor="description" className="font-semibold text-totk-ivory">
                    Description
                  </label>
                  <textarea
                    id="description"
                    placeholder="Describe your suggestion in detail. What would you like to see? Why would it benefit the community? Be as specific as possible!"
                    maxLength={maxChars}
                    value={formState.description}
                    onChange={(e) =>
                      setFormState({ ...formState, description: e.target.value })
                    }
                    className="flex-1 w-full p-4 rounded-lg text-botw-pale transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] resize-none"
                    style={{
                      background: "rgba(26, 22, 21, 0.9)",
                      border: "2px solid var(--totk-dark-ocher)",
                      minHeight: "250px",
                    }}
                  />
                  <div
                    className="text-right text-sm"
                    style={{
                      color:
                        charCount > 900
                          ? "#e74c3c"
                          : charCount > 800
                            ? "#f39c12"
                            : "var(--totk-grey-200)",
                    }}
                  >
                    {charCount}/{maxChars}
                  </div>
                </div>

                {error && (
                  <div
                    className="flex items-center gap-2 p-3 rounded-lg"
                    style={{
                      background: "rgba(231, 76, 60, 0.15)",
                      border: "1px solid rgba(231, 76, 60, 0.5)",
                      color: "#e74c3c",
                    }}
                  >
                    <i className="fas fa-exclamation-circle" />
                    {error}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed hover:shadow-lg hover:-translate-y-0.5"
                    style={{
                      background: "var(--totk-light-green)",
                      color: "var(--totk-black)",
                    }}
                  >
                    {isSubmitting ? (
                      <>
                        <i className="fas fa-spinner fa-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-paper-plane" />
                        Submit Suggestion
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 hover:bg-white/10"
                    style={{
                      background: "rgba(32, 36, 44, 0.72)",
                      color: "var(--botw-pale)",
                      border: "1px solid var(--totk-dark-ocher)",
                    }}
                  >
                    <i className="fas fa-undo" />
                    Reset
                  </button>
                </div>
              </form>
            </div>

            {/* Info Panel - 1/4 width, combined into one container */}
            <div
              className="rounded-xl p-5 backdrop-blur-sm flex flex-col h-full"
              style={{
                background: "rgba(32, 36, 44, 0.72)",
                border: "1px solid var(--totk-dark-ocher)",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
              }}
            >
              {/* How It Works */}
              <div className="mb-6">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-totk-light-green mb-4">
                  <i className="fas fa-info-circle" />
                  How It Works
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3 text-botw-pale">
                    <span className="text-totk-light-green mt-0.5">
                      <i className="fas fa-check-circle" />
                    </span>
                    <span>Your suggestion is posted anonymously to Discord</span>
                  </li>
                  <li className="flex items-start gap-3 text-botw-pale">
                    <span className="text-totk-light-green mt-0.5">
                      <i className="fas fa-check-circle" />
                    </span>
                    <span>Staff will review and respond in the server</span>
                  </li>
                  <li className="flex items-start gap-3 text-botw-pale">
                    <span className="text-totk-light-green mt-0.5">
                      <i className="fas fa-check-circle" />
                    </span>
                    <span>Great ideas may be implemented!</span>
                  </li>
                </ul>
              </div>

              {/* Divider */}
              <div
                className="border-t my-2"
                style={{ borderColor: "var(--totk-dark-ocher)" }}
              />

              {/* Tips */}
              <div className="mt-4">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-totk-light-green mb-4">
                  <i className="fas fa-lightbulb" />
                  Tips for Great Suggestions
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3 text-botw-pale">
                    <span className="text-totk-light-green mt-0.5">
                      <i className="fas fa-star" />
                    </span>
                    <span>Be specific about what you&apos;d like to see</span>
                  </li>
                  <li className="flex items-start gap-3 text-botw-pale">
                    <span className="text-totk-light-green mt-0.5">
                      <i className="fas fa-star" />
                    </span>
                    <span>Explain why it would benefit the community</span>
                  </li>
                  <li className="flex items-start gap-3 text-botw-pale">
                    <span className="text-totk-light-green mt-0.5">
                      <i className="fas fa-star" />
                    </span>
                    <span>Frame feedback as collaboration, not accusation</span>
                  </li>
                </ul>
              </div>

              {/* Divider */}
              <div
                className="border-t my-4"
                style={{ borderColor: "var(--totk-dark-ocher)" }}
              />

              {/* A Note From The Team */}
              <div className="mt-2 flex-1">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-totk-light-green mb-3">
                  <i className="fas fa-heart" />
                  A Note From The Team
                </h3>
                <div className="space-y-3 text-sm text-botw-pale">
                  <p>
                    We understand that frustration can come from a place of caring about the community, and we truly appreciate that passion.
                  </p>
                  <p>
                    Roots is run entirely by volunteers who dedicate their free time to making this group special. While we do our best, we can&apos;t always perfectly cater to every member&apos;s needs.
                  </p>
                  <p>
                    We love receiving suggestions and feedback! We just ask that it&apos;s worded constructively—as collaboration rather than accusation. It helps us work toward solutions together.
                  </p>
                  <p className="font-medium text-totk-ivory">
                    All we ask is for respect and patience. 💚
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Success Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: "rgba(0, 0, 0, 0.6)",
              backdropFilter: "blur(8px)",
            }}
            onClick={closeModal}
          />
          <div
            className="relative rounded-2xl overflow-hidden max-w-[90vw] w-[400px] animate-in zoom-in-95 duration-300"
            style={{
              background: "var(--botw-warm-black)",
              border: "1px solid var(--totk-dark-ocher)",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div
              className="p-6 pb-4 text-center relative"
              style={{
                background: "linear-gradient(135deg, var(--totk-light-green), var(--totk-green))",
              }}
            >
              <h3 className="text-xl font-semibold text-totk-black">
                Submission Successful!
              </h3>
              <button
                onClick={closeModal}
                aria-label="Close modal"
                className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
                style={{
                  background: "rgba(0, 0, 0, 0.2)",
                  color: "var(--totk-black)",
                }}
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="p-8 text-center">
              <div className="mb-4">
                <i className="fas fa-check-circle text-5xl text-totk-light-green" />
              </div>
              <p className="text-lg font-medium text-totk-ivory">
                Your suggestion has been sent to Discord!
              </p>
            </div>
            <div className="px-6 pb-6 text-center">
              <button
                onClick={closeModal}
                className="px-8 py-3 rounded-lg font-semibold transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: "var(--totk-light-green)",
                  color: "var(--totk-black)",
                  boxShadow: "0 4px 12px rgba(73, 213, 156, 0.3)",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
