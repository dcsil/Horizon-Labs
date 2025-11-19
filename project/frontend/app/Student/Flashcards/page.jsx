"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const heroTitleClasses = `text-4xl font-bold text-gray-900 ${poppins.className}`;
const heroSubtitleClasses = `text-base text-gray-600 mt-2 ${poppins.className}`;

const wizardSteps = [
  "Upload Material",
  "Ingest File",
  "Configure Deck",
  "Generated Flashcards",
  "Review Session",
];

const placeholderDecks = [
  {
    id: "deck-3",
    title: "Discrete Math Proof Patterns",
    description: "Quick cues for induction, combinatorics, and proof tricks.",
    cards: 12,
    lastReviewed: "Sep 14 • 94% accuracy",
    tags: ["Math", "Proofs"],
    color: "from-emerald-50 to-white",
    demoPreview: true,
  },
  {
    id: "deck-1",
    title: "Neural Networks Fundamentals",
    description: "Core definitions and equations for activation functions and training loops.",
    cards: 24,
    lastReviewed: "Sep 21 • 82% accuracy",
    tags: ["AI", "Week 5"],
    color: "from-purple-50 to-white",
  },
  {
    id: "deck-2",
    title: "Operating Systems Midterm Review",
    description: "Scheduling algorithms, memory models, and deadlock prevention tactics.",
    cards: 32,
    lastReviewed: "Sep 18 • 71% accuracy",
    tags: ["Systems", "Practice"],
    color: "from-blue-50 to-white",
  },
];

const sampleFlashcards = [
  {
    id: "fc-1",
    question: "What is the perceptron update rule for adjusting weights?",
    answer:
      "w_new = w_old + learning_rate * (expected - predicted) * input, applied for misclassified examples.",
  },
  {
    id: "fc-2",
    question: "Name two advantages of adaptive learning rate strategies.",
    answer: "Faster convergence on plateaus and reduced need for manual tuning across layers or batches.",
  },
  {
    id: "fc-3",
    question: "How does dropout prevent overfitting?",
    answer: "It randomly zeroes activations during training so neurons cannot co-adapt, enforcing redundancy.",
  },
  {
    id: "fc-4",
    question: "What metric evaluates classification performance across imbalanced classes?",
    answer: "Macro-averaged F1 or balanced accuracy give equal weight to each class irrespective of frequency.",
  },
];

const ingestStages = ["Parsing slides", "Chunking concepts", "Indexing embeddings"];

const topicPresets = ["Neural Nets", "Optimization", "Evaluation", "General"];

const StepBadge = ({ label, index, isActive, isComplete }) => (
  <div className="flex items-center gap-3">
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
        isComplete
          ? "bg-purple-600 text-white border-purple-600"
          : isActive
          ? "border-purple-500 text-purple-600"
          : "border-gray-300 text-gray-400"
      }`}
    >
      {index + 1}
    </div>
    <span className={`text-sm font-medium ${isActive ? "text-gray-900" : "text-gray-500"}`}>{label}</span>
  </div>
);

export default function StudentFlashcardsPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [ingestionStatus, setIngestionStatus] = useState("idle");
  const [stageProgress, setStageProgress] = useState(
    ingestStages.map((label) => ({ label, status: "pending" })),
  );
  const [deckTitle, setDeckTitle] = useState("Neural Networks Deep Dive");
  const [deckDescription, setDeckDescription] = useState(
    "Key checkpoints pulled from lecture slides to reinforce the fundamentals.",
  );
  const [topics, setTopics] = useState(["Neural Nets"]);
  const [cardTarget, setCardTarget] = useState(20);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [flashcards, setFlashcards] = useState(sampleFlashcards);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0 });
  const [deckNotice, setDeckNotice] = useState("");

  const currentReviewCard = useMemo(() => {
    if (!reviewQueue.length) return null;
    const index = reviewQueue[0];
    return flashcards[index];
  }, [flashcards, reviewQueue]);

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0];
    setUploadedFile(nextFile || null);
    setIngestionStatus("idle");
    setStageProgress(ingestStages.map((label) => ({ label, status: "pending" })));
    setCurrentStep(1);
  };

  const simulateIngestion = () => {
    if (!uploadedFile) return;
    setCurrentStep(2);
    setIngestionStatus("processing");
    setStageProgress((prev) =>
      prev.map((stage, index) => ({
        ...stage,
        status: index === 0 ? "active" : "pending",
      })),
    );
    ingestStages.forEach((_, index) => {
      setTimeout(() => {
        setStageProgress((prev) =>
          prev.map((stage, stageIndex) => {
            if (stageIndex < index) return { ...stage, status: "complete" };
            if (stageIndex === index) return { ...stage, status: "complete" };
            if (stageIndex === index + 1) return { ...stage, status: "active" };
            return stage;
          }),
        );
        if (index === ingestStages.length - 1) {
          setIngestionStatus("complete");
          setCurrentStep(3);
        }
      }, (index + 1) * 900);
    });
  };

  const toggleTopic = (topic) => {
    setTopics((prev) => {
      if (prev.includes(topic)) {
        return prev.filter((item) => item !== topic);
      }
      return [...prev, topic];
    });
  };

  const handleDeckReview = (deck) => {
    if (deck.demoPreview) {
      router.push("/Student/Flashcards/Walkthrough");
      return;
    }
    setDeckNotice("Full deck review is coming soon. Try the Discrete Math demo for a sneak peek.");
  };

  const handleGenerateFlashcards = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setHasGenerated(true);
      setFlashcards(sampleFlashcards);
      setCurrentStep(4);
    }, 1100);
  };

  const startReviewSession = () => {
    setReviewQueue(flashcards.map((_, index) => index));
    setSessionStats({ correct: 0, incorrect: 0 });
    setShowAnswer(false);
    setCurrentStep(5);
  };

  const handleReveal = () => {
    if (!currentReviewCard) return;
    setShowAnswer(true);
  };

  const markResponse = (isCorrect) => {
    if (!reviewQueue.length || !showAnswer) return;
    const [currentIndex, ...rest] = reviewQueue;
    const updatedQueue = [...rest];
    if (!isCorrect) {
      updatedQueue.push(currentIndex);
    }
    setReviewQueue(updatedQueue);
    setSessionStats((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      incorrect: prev.incorrect + (isCorrect ? 0 : 1),
    }));
    setShowAnswer(false);
  };

  const sessionComplete = currentStep === 5 && !reviewQueue.length && hasGenerated;

  const creationActions = (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => router.push("/Student/HomePage")}
        className={`inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-purple-400 ${poppins.className}`}
      >
        ← Back to Home
      </button>
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
          setCurrentStep(1);
        }}
        className={`inline-flex items-center gap-2 rounded-2xl border border-purple-100 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 ${poppins.className}`}
      >
        Create Flashcards
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col gap-4">
          {creationActions}
          <div>
            <h1 className={heroTitleClasses}>Flashcards Lab</h1>
            <p className={heroSubtitleClasses}>
              Upload lecture decks, generate flashcards, and rehearse concepts with spaced active recall.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_minmax(300px,1fr)]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={`text-2xl font-semibold text-gray-900 ${poppins.className}`}>
                  Create Flashcard Deck
                </h2>
                <span className="text-sm text-gray-500">
                  Static preview • No backend actions triggered.
                </span>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {wizardSteps.map((step, index) => (
                  <StepBadge
                    key={step}
                    label={step}
                    index={index}
                    isActive={currentStep === index + 1}
                    isComplete={currentStep > index + 1}
                  />
                ))}
              </div>

              <div className="mt-8">
                {currentStep === 1 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Upload course material</h3>
                    <label
                      htmlFor="flashcard-upload"
                      className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center hover:border-purple-300"
                    >
                      <span className="text-sm font-semibold text-gray-900">
                        Drop PDF/PPTX files here or click to browse
                      </span>
                      <span className="text-xs text-gray-500">
                        We will parse slides, chunk content, and generate embeddings to fuel flashcard creation.
                      </span>
                      <input
                        id="flashcard-upload"
                        type="file"
                        accept=".pdf,.ppt,.pptx"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                    {uploadedFile && (
                      <div className="rounded-2xl border border-purple-100 bg-purple-50 px-4 py-3 text-sm text-purple-700">
                        Selected file: {uploadedFile.name}
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={!uploadedFile}
                      onClick={simulateIngestion}
                      className={`inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-md ${
                        uploadedFile ? "bg-gradient-to-r from-purple-500 to-blue-500" : "bg-gray-300"
                      }`}
                    >
                      Ingest File
                    </button>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Ingesting "{uploadedFile?.name}"</h3>
                    <p className="text-sm text-gray-500">
                      We simulate parsing, chunking, and indexing to showcase the final experience.
                    </p>
                    <div className="space-y-3">
                      {stageProgress.map((stage) => (
                        <div
                          key={stage.label}
                          className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-3"
                        >
                          <span className="text-sm text-gray-800">{stage.label}</span>
                          <span
                            className={`text-xs font-semibold ${
                              stage.status === "complete"
                                ? "text-green-600"
                                : stage.status === "active"
                                ? "text-purple-600"
                                : "text-gray-400"
                            }`}
                          >
                            {stage.status === "complete"
                              ? "Complete"
                              : stage.status === "active"
                              ? "Processing..."
                              : "Pending"}
                          </span>
                        </div>
                      ))}
                    </div>
                    {ingestionStatus === "complete" && (
                      <button
                        type="button"
                        onClick={() => setCurrentStep(3)}
                        className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-md"
                      >
                        Continue to configuration
                      </button>
                    )}
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Deck details</h3>
                      <p className="text-sm text-gray-500">
                        Give learners context so they can find the right deck later.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Title
                        <input
                          type="text"
                          value={deckTitle}
                          onChange={(event) => setDeckTitle(event.target.value)}
                          className="mt-1 w-full rounded-2xl border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none"
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Description
                        <textarea
                          rows={3}
                          value={deckDescription}
                          onChange={(event) => setDeckDescription(event.target.value)}
                          className="mt-1 w-full rounded-2xl border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none"
                        />
                      </label>
                      <div>
                        <span className="block text-sm font-medium text-gray-700 mb-2">Topics to emphasize</span>
                        <div className="flex flex-wrap gap-2">
                          {topicPresets.map((topic) => {
                            const selected = topics.includes(topic);
                            return (
                              <button
                                type="button"
                                key={topic}
                                onClick={() => toggleTopic(topic)}
                                className={`rounded-full border px-4 py-1 text-sm font-semibold ${
                                  selected
                                    ? "border-purple-600 bg-purple-50 text-purple-700"
                                    : "border-gray-200 text-gray-600"
                                }`}
                              >
                                {topic}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <label className="block text-sm font-medium text-gray-700">
                        Number of flashcards
                        <input
                          type="number"
                          min={5}
                          max={50}
                          value={cardTarget}
                          onChange={(event) => setCardTarget(Number(event.target.value))}
                          className="mt-1 w-32 rounded-2xl border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateFlashcards}
                      className={`inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-md ${
                        isGenerating ? "bg-gray-400" : "bg-gradient-to-r from-purple-500 to-blue-500"
                      }`}
                    >
                      {isGenerating ? "Generating flashcards..." : "Generate Flashcards"}
                    </button>
                  </div>
                )}

                {currentStep === 4 && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{deckTitle}</h3>
                        <p className="text-sm text-gray-500">Preview the generated flashcards before review.</p>
                      </div>
                      <button
                        type="button"
                        onClick={startReviewSession}
                        className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-md"
                      >
                        Start Review Session
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {flashcards.map((card) => (
                        <div key={card.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                          <p className="text-xs uppercase tracking-wide text-purple-500 font-semibold">Prompt</p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">{card.question}</p>
                          <p className="mt-3 text-xs uppercase tracking-wide text-gray-400 font-semibold">Answer</p>
                          <p className="mt-1 text-sm text-gray-700">{card.answer}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {currentStep === 5 && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Review Session • {deckTitle}</h3>
                        <p className="text-sm text-gray-500">
                          Practice active recall. Cards answered incorrectly cycle back into the queue.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 px-4 py-2">
                        <span className="text-xs uppercase tracking-wide text-gray-500">Progress</span>
                        <p className="font-semibold text-gray-900">
                          {sessionStats.correct + sessionStats.incorrect}/{flashcards.length} attempts
                        </p>
                      </div>
                    </div>
                    {sessionComplete ? (
                      <div className="rounded-3xl border border-green-200 bg-green-50 px-6 py-10 text-center">
                        <p className="text-lg font-semibold text-green-800">Nice work!</p>
                        <p className="text-sm text-green-700">
                          All flashcards were marked correct in this session. Re-run the deck anytime.
                        </p>
                        <button
                          type="button"
                          onClick={startReviewSession}
                          className="mt-4 rounded-2xl border border-green-400 px-4 py-2 text-sm font-semibold text-green-700"
                        >
                          Restart Session
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                          <p className="text-xs uppercase tracking-wide text-purple-500 font-semibold">
                            Flashcard
                          </p>
                          <p className="mt-2 text-xl font-semibold text-gray-900">
                            {currentReviewCard?.question || "All caught up"}
                          </p>
                          {showAnswer ? (
                            <div className="mt-4 rounded-2xl bg-purple-50 px-4 py-3">
                              <p className="text-xs uppercase tracking-wide text-purple-500 font-semibold">
                                Answer
                              </p>
                              <p className="text-sm text-gray-800">{currentReviewCard?.answer}</p>
                            </div>
                          ) : (
                            <p className="mt-4 text-sm text-gray-500">Try recalling the answer before revealing.</p>
                          )}
                          <div className="mt-6 flex flex-wrap gap-3">
                            {!showAnswer ? (
                              <button
                                type="button"
                                onClick={handleReveal}
                                className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-md"
                              >
                                Reveal Answer
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => markResponse(true)}
                                  className="rounded-2xl border border-green-300 bg-green-50 px-5 py-3 text-sm font-semibold text-green-700"
                                >
                                  I got it right
                                </button>
                                <button
                                  type="button"
                                  onClick={() => markResponse(false)}
                                  className="rounded-2xl border border-rose-300 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700"
                                >
                                  Need to review again
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
                          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                            Session stats (mock)
                          </p>
                          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                            <div>
                              <p className="text-2xl font-bold text-purple-700">{sessionStats.correct}</p>
                              <p className="text-xs text-gray-500">Marked correct</p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-rose-600">{sessionStats.incorrect}</p>
                              <p className="text-xs text-gray-500">Need work</p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-gray-800">
                                {flashcards.length - reviewQueue.length}
                              </p>
                              <p className="text-xs text-gray-500">Cleared cards</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Your Decks</h3>
                <span className="text-xs text-gray-400">Static preview</span>
              </div>
              <div className="mt-4 space-y-4">
                {placeholderDecks.map((deck) => (
                  <div
                    key={deck.id}
                    className={`rounded-2xl border border-gray-100 bg-gradient-to-br ${deck.color} p-4`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-md font-semibold text-gray-900">{deck.title}</h4>
                      {deck.demoPreview && (
                        <span className="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-emerald-700">
                          Demo
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{deck.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                      <span className="rounded-full bg-white/80 px-3 py-1 font-semibold text-gray-800">
                        {deck.cards} cards
                      </span>
                      <span className="rounded-full bg-white/80 px-3 py-1 font-semibold text-gray-800">
                        {deck.lastReviewed}
                      </span>
                      {deck.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white/80 px-3 py-1 font-semibold text-gray-800">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeckReview(deck)}
                      className="mt-4 w-full rounded-2xl border border-gray-200 bg-white/90 px-4 py-2 text-sm font-semibold text-purple-700"
                    >
                      {deck.demoPreview ? "Launch walkthrough" : "Review deck"}
                    </button>
                  </div>
                ))}
              </div>
              {deckNotice && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {deckNotice}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900">Progress snapshot</h3>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Decks created</p>
                    <p className="text-2xl font-bold text-gray-900">7</p>
                  </div>
                  <span className="text-xs text-green-600">+2 this week</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                      Cards reviewed (week)
                    </p>
                    <p className="text-2xl font-bold text-gray-900">128</p>
                  </div>
                  <span className="text-xs text-purple-600">Steady streak</span>
                </div>
                <div className="rounded-2xl border border-gray-100 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Focus suggestions</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-gray-600">
                    <li>Operating Systems review accuracy dipped below 75%.</li>
                    <li>Create a mini deck for Week 6 labs before next quiz.</li>
                  </ul>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
