"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const deckWalkthroughCards = [
  {
    id: "demo-1",
    question: "What is the base case requirement for a proof by induction?",
    answer: "You must show the statement holds for the first value in the domain (e.g., n = 0 or n = 1).",
  },
  {
    id: "demo-2",
    question: "Which combinatorics identity counts subsets of size k?",
    answer: "The binomial coefficient C(n, k) = n! / (k!(n - k)!) counts subsets of size k from n items.",
  },
  {
    id: "demo-3",
    question: "How do you prove a statement by contradiction?",
    answer: "Assume the opposite of what you want to prove and show it leads to an impossibility.",
  },
  {
    id: "demo-4",
    question: "What makes constructive proofs unique?",
    answer: "They explicitly build an example to show an object with desired properties exists.",
  },
];

/**
 * Static walkthrough that demonstrates reviewing a demo flashcard deck.
 */
export default function FlashcardWalkthroughPage() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [progress, setProgress] = useState({ correct: 0, revisit: 0 });
  const currentCard = useMemo(() => deckWalkthroughCards[index], [index]);
  const total = deckWalkthroughCards.length;

  /** Reveals the current card's answer. */
  const handleReveal = () => setRevealed(true);

  /** Records the result for the current card and advances the walkthrough. */
  const advance = (didGetItRight) => {
    setProgress((prev) => ({
      correct: prev.correct + (didGetItRight ? 1 : 0),
      revisit: prev.revisit + (didGetItRight ? 0 : 1),
    }));
    setRevealed(false);
    setIndex((prev) => (prev + 1) % total);
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/Student/Flashcards")}
            className={`inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-purple-400 ${poppins.className}`}
          >
            ← Back to Flashcards Lab
          </button>
          <span className="text-xs text-gray-400 uppercase tracking-wide">Static walkthrough</span>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-purple-600 font-semibold">Demo deck</p>
            <h1 className={`text-3xl font-bold text-gray-900 mt-1 ${poppins.className}`}>
              Discrete Math Proof Patterns
            </h1>
            <p className={`text-sm text-gray-500 ${poppins.className}`}>
              This mock flow shows how flashcards will feel when reviewing. Work through four cards and mark how you
              did after revealing each answer.
            </p>
          </div>

          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span className="font-semibold text-gray-900">
              Card {index + 1} of {total}
            </span>
            <span>•</span>
            <span>{progress.correct} marked correct • {progress.revisit} need review</span>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
            <p className="text-xs uppercase tracking-wide text-purple-600 font-semibold">Prompt</p>
            <p className="mt-2 text-xl font-semibold text-gray-900">{currentCard.question}</p>

            {revealed ? (
              <div className="mt-6 rounded-2xl bg-white px-5 py-4 border border-purple-100">
                <p className="text-xs uppercase tracking-wide text-emerald-600 font-semibold">Answer</p>
                <p className="mt-1 text-sm text-gray-800">{currentCard.answer}</p>
              </div>
            ) : (
              <p className="mt-6 text-sm text-gray-500">
                Try to recall the answer before revealing. Use these decks for active recall practice.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {!revealed ? (
              <button
                type="button"
                onClick={handleReveal}
                className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-lg"
              >
                Reveal Answer
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => advance(true)}
                  className="rounded-2xl border border-green-300 bg-green-50 px-5 py-3 text-sm font-semibold text-green-700"
                >
                  I remembered it
                </button>
                <button
                  type="button"
                  onClick={() => advance(false)}
                  className="rounded-2xl border border-rose-300 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700"
                >
                  Need to review
                </button>
              </>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className={`text-lg font-semibold text-gray-900 mb-3 ${poppins.className}`}>Deck preview</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {deckWalkthroughCards.map((card) => (
              <div key={card.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-purple-500 font-semibold">Question</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{card.question}</p>
                <p className="mt-3 text-xs uppercase tracking-wide text-gray-400 font-semibold">Answer</p>
                <p className="mt-1 text-sm text-gray-700">{card.answer}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-500">
            In the full experience you’ll be able to jump between decks, filter by topic, and track your accuracy over
            time. This page is a static preview of the in-progress feature.
          </p>
        </div>
      </div>
    </div>
  );
}
