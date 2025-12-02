"use client";

import { useState } from "react";
import { Poppins } from "next/font/google";
import { useRouter } from "next/navigation";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/**
 * Instructor policy configuration preview for toggling guidance, scope, and allowed content.
 */
export default function PolicyPage() {
  const router = useRouter();
  const [guidanceEnabled, setGuidanceEnabled] = useState(true);
  const [frictionLevel, setFrictionLevel] = useState(1);
  const [checkDifficulty, setCheckDifficulty] = useState(50);
  const [contentScope, setContentScope] = useState("course_only");
  const [assessmentQuestions, setAssessmentQuestions] = useState(20);
  const [assessmentTimeLimit, setAssessmentTimeLimit] = useState(45);
  const [assessmentMaxAttempts, setAssessmentMaxAttempts] = useState(3);
  const [practiceIncreaseStreak, setPracticeIncreaseStreak] = useState(3);
  const [practiceDecreaseStreak, setPracticeDecreaseStreak] = useState(2);
  const [slideCoverageThreshold, setSlideCoverageThreshold] = useState(70);
  const [retrieverSampleSize, setRetrieverSampleSize] = useState(4);
  const [retrieverTopK, setRetrieverTopK] = useState(20);
  const [missedQuestionGap, setMissedQuestionGap] = useState(2);
  const serviceOptions = ["Adaptive chat", "Practice quizzes", "Assessment quizzes", "Flashcards"];
  const emptyPolicyForm = {
    id: null,
    name: "",
    start: "",
    end: "",
    availability: "blocked",
    services: [],
  };
  const [policyForm, setPolicyForm] = useState(emptyPolicyForm);
  const [policies, setPolicies] = useState([]);
  const [focusFiles, setFocusFiles] = useState([]);
  const [denyFiles, setDenyFiles] = useState([]);
  const [selectedFocusFiles, setSelectedFocusFiles] = useState(new Set());
  const [selectedDenyFiles, setSelectedDenyFiles] = useState(new Set());
  
  const frictionOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  /** Updates the friction slider that tunes chat guardrails. */
  const handleFrictionSelect = (level) => {
    setFrictionLevel(level);
  };

  const scopeOptions = [
    {
      key: "course_only",
      label: "Course content only",
      description: "Responses are grounded solely in uploaded course files.",
    },
    {
      key: "suggest_external",
      label: "Suggest external references",
      description:
        "Assistant can recommend outside materials but does not use them directly when generating answers.",
    },
    {
      key: "allow_external",
      label: "Allow external sources",
      description: "Assistant can draw from external sources as well as course files.",
    },
  ];

  /** Toggles whether the assistant proactively provides guidance. */
  const handleToggleGuidance = () => {
    const nextEnabled = !guidanceEnabled;
    setGuidanceEnabled(nextEnabled);
  };

  /** Toggles a service's inclusion in the active policy window. */
  const handleServiceToggle = (service) => {
    setPolicyForm((prev) => {
      const exists = prev.services.includes(service);
      return {
        ...prev,
        services: exists ? prev.services.filter((s) => s !== service) : [...prev.services, service],
      };
    });
  };

  /** Validates and stores a policy window locally. */
  const handlePolicySubmit = () => {
    if (!policyForm.start || !policyForm.end || policyForm.services.length === 0) {
      return;
    }
    const normalizedForm = { ...policyForm, availability: "blocked" };
    if (policyForm.id) {
      setPolicies((prev) => prev.map((p) => (p.id === policyForm.id ? normalizedForm : p)));
    } else {
      setPolicies((prev) => [...prev, { ...normalizedForm, id: Date.now() }]);
    }
    setPolicyForm(emptyPolicyForm);
  };

  /** Loads an existing policy into the editor for updates. */
  const handlePolicyEdit = (policy) => {
    setPolicyForm({ ...policy });
  };

  /** Deletes a saved policy and clears the form if it was being edited. */
  const handlePolicyDelete = (id) => {
    setPolicies((prev) => prev.filter((p) => p.id !== id));
    if (policyForm.id === id) {
      setPolicyForm(emptyPolicyForm);
    }
  };

  /** Simulates uploading a focus file and selects it by default. */
  const handleFocusFileUpload = () => {
    const nextIndex = focusFiles.length + 1;
    const newFile = {
      id: Date.now(),
      name: `focus_${nextIndex}.pdf`,
    };
    setFocusFiles([...focusFiles, newFile]);
    setSelectedFocusFiles(new Set([...selectedFocusFiles, newFile.id]));
  };

  /** Simulates uploading a deny list file and selects it by default. */
  const handleDenyFileUpload = () => {
    const nextIndex = denyFiles.length + 1;
    const newFile = {
      id: Date.now(),
      name: `deny_${nextIndex}.pdf`,
    };
    setDenyFiles([...denyFiles, newFile]);
    setSelectedDenyFiles(new Set([...selectedDenyFiles, newFile.id]));
  };

  /** Toggles a focus file selection. */
  const handleFocusFileToggle = (fileId) => {
    const newSelected = new Set(selectedFocusFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFocusFiles(newSelected);
  };

  /** Toggles a deny file selection. */
  const handleDenyFileToggle = (fileId) => {
    const newSelected = new Set(selectedDenyFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedDenyFiles(newSelected);
  };

  /** Removes a focus file and unselects it. */
  const handleDeleteFocusFile = (fileId) => {
    setFocusFiles((prev) => prev.filter((file) => file.id !== fileId));
    setSelectedFocusFiles((prev) => {
      const next = new Set(prev);
      next.delete(fileId);
      return next;
    });
  };

  /** Removes a deny file and unselects it. */
  const handleDeleteDenyFile = (fileId) => {
    setDenyFiles((prev) => prev.filter((file) => file.id !== fileId));
    setSelectedDenyFiles((prev) => {
      const next = new Set(prev);
      next.delete(fileId);
      return next;
    });
  };

  /** Navigates to the policy test prompt page. */
  const handleRunTestPrompt = () => {
    router.push("/Instructor/Policy/Test");
  };

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <div className="flex h-full min-h-screen flex-col xl:flex-row">
        {/* left border line */}
        <div className="hidden xl:block w-80 bg-white border-r border-[#9690B7] relative z-10" />

        {/* Main Content Area */}
        <div className="flex-1 bg-white relative z-10">
          <div className="min-h-[calc(100vh-4rem)] flex flex-col px-6 py-10 sm:px-10 lg:px-16">
            <div className="flex flex-col max-w-4xl pt-10 sm:pt-12 lg:pt-16">
              <div className="mb-8 sm:mb-10">
                <h1
                  className={`text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-3 ${poppins.className}`}
                >
                  AI & Content Scope
                </h1>
                <p
                  className={`text-base sm:text-lg text-gray-500 ${poppins.className}`}
                  style={{ marginLeft: 5, paddingLeft: 0 }}
                >
                  Preview how you might align the assistant experience with institutional guidelines.
                </p>
              </div>

              <div className="space-y-10">
                {/* Site-wide policy scheduling */}
                <section className="space-y-6">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h2 className={`text-xl sm:text-2xl font-bold text-gray-900 ${poppins.className}`}>
                        Site-wide policy windows
                      </h2>
                      <p className={`text-sm text-gray-600 ${poppins.className}`}>
                        Pick time windows and decide which learner services are unavailable.
                      </p>
                    </div>
                    <button
                      onClick={() => setPolicyForm(emptyPolicyForm)}
                      className="text-sm font-semibold text-purple-700 hover:text-purple-800"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 sm:p-8 space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <div className={`text-sm font-medium text-gray-700 mb-1 ${poppins.className}`}>
                          Window starts
                        </div>
                        <input
                          type="datetime-local"
                          value={policyForm.start}
                          onChange={(e) => setPolicyForm((prev) => ({ ...prev, start: e.target.value }))}
                          className="w-full rounded-xl border-2 border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-purple-400"
                        />
                      </label>
                      <label className="block">
                        <div className={`text-sm font-medium text-gray-700 mb-1 ${poppins.className}`}>
                          Window ends
                        </div>
                        <input
                          type="datetime-local"
                          value={policyForm.end}
                          onChange={(e) => setPolicyForm((prev) => ({ ...prev, end: e.target.value }))}
                          className="w-full rounded-xl border-2 border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-purple-400"
                        />
                      </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <div className={`text-sm font-medium text-gray-700 mb-1 ${poppins.className}`}>
                          Policy name (optional)
                        </div>
                        <input
                          type="text"
                          value={policyForm.name}
                          onChange={(e) => setPolicyForm((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g., Midterm blackout"
                          className="w-full rounded-xl border-2 border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-purple-400"
                        />
                      </label>
                    </div>

                    <div className="space-y-3">
                      <div className={`text-sm font-semibold text-gray-800 ${poppins.className}`}>
                        Choose services blocked during this window
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {serviceOptions.map((service) => {
                          const checked = policyForm.services.includes(service);
                          return (
                            <label
                              key={service}
                              className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-colors ${
                                checked ? "border-purple-400 bg-purple-50" : "border-gray-200 bg-white hover:border-gray-300"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleServiceToggle(service)}
                                className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                              />
                              <span className={`text-sm text-gray-800 ${poppins.className}`}>{service}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={handlePolicySubmit}
                        className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-xl font-semibold hover:shadow-lg transition-transform duration-200 hover:scale-105"
                      >
                        {policyForm.id ? "Update policy" : "Add policy"}
                      </button>
                    </div>
                  </div>

                  {/* Policy list */}
                  <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 sm:p-8 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <h3 className={`text-lg font-semibold text-gray-900 ${poppins.className}`}>Active policy windows</h3>
                      <p className={`text-sm text-gray-600 ${poppins.className}`}>Static preview; not enforced yet.</p>
                    </div>
                    {policies.length === 0 ? (
                      <p className={`text-sm text-gray-500 ${poppins.className}`}>No policies added yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {policies.map((policy) => {
                          return (
                            <div
                              key={policy.id}
                              className="rounded-xl border-2 border-gray-200 px-4 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="space-y-1">
                                <div className={`text-sm font-semibold text-gray-900 ${poppins.className}`}>
                                  {policy.name || "Untitled policy"}
                                </div>
                                <div className={`text-sm text-gray-600 ${poppins.className}`}>
                                  {new Date(policy.start).toLocaleString()} — {new Date(policy.end).toLocaleString()}
                                </div>
                                <div className={`text-sm text-gray-700 ${poppins.className}`}>
                                  Services blocked: {policy.services.join(", ")}
                                </div>
                              </div>
                              <div className="flex gap-3">
                                <button
                                  onClick={() => handlePolicyEdit(policy)}
                                  className="text-sm font-semibold text-blue-700 hover:text-blue-800"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handlePolicyDelete(policy.id)}
                                  className="text-sm font-semibold text-red-700 hover:text-red-800"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>

                {/* Chat Settings Group */}
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <h2 className={`text-xl sm:text-2xl font-bold text-gray-900 ${poppins.className}`}>
                      Chat Settings
                    </h2>
                  </div>

                  <div className="space-y-6">
                    {/* Guidance Settings */}
                    <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 sm:p-8">
                      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                        <div>
                          <h3
                            className={`text-xl sm:text-2xl font-bold text-gray-900 ${poppins.className}`}
                          >
                            Guidance & Friction
                          </h3>
                          <p
                            className={`text-sm text-gray-600 ${poppins.className}`}
                          >
                            Control how many focused attempts unlock guided help and how strict the checks are.
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium text-gray-700 ${poppins.className}`}>
                            Guidance
                          </span>
                          <button
                            onClick={handleToggleGuidance}
                            className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors duration-200 ${
                              guidanceEnabled ? "bg-purple-600" : "bg-gray-300"
                            }`}
                            aria-pressed={guidanceEnabled}
                            type="button"
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
                                guidanceEnabled ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-6">
                        {/* Friction Level Section */}
                        <div className={`space-y-2 ${!guidanceEnabled ? "opacity-60" : ""}`}>
                          <div className="flex items-center justify-between">
                            <h4 className={`text-lg font-semibold text-gray-900 ${poppins.className}`}>
                              Friction Level
                            </h4>
                            <span className={`text-sm text-gray-500 ${poppins.className}`}>
                              Minimum checks
                            </span>
                          </div>
                          <select
                            value={frictionLevel}
                            onChange={(e) => guidanceEnabled && handleFrictionSelect(Number(e.target.value))}
                            disabled={!guidanceEnabled}
                            className={`w-full px-4 py-3 bg-gray-50 border-2 border-gray-300 rounded-xl text-base font-medium text-gray-900 ${poppins.className} ${
                              guidanceEnabled ? "hover:border-purple-400 cursor-pointer" : "cursor-not-allowed"
                            }`}
                          >
                            {frictionOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Check Difficulty Section */}
                        <div className={`space-y-3 ${!guidanceEnabled ? "opacity-60" : ""}`}>
                          <div className="flex items-center justify-between">
                            <h4 className={`text-lg font-semibold text-gray-900 ${poppins.className}`}>
                              Difficulty of Making Checks
                            </h4>
                            <span className={`text-sm text-gray-500 ${poppins.className}`}>
                              Stricter vs lenient
                            </span>
                          </div>
                          <div className="space-y-4">
                            <div className="flex items-center gap-4">
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={checkDifficulty}
                                onChange={(e) => guidanceEnabled && setCheckDifficulty(Number(e.target.value))}
                                className={`flex-1 h-2 bg-gray-200 rounded-lg appearance-none ${
                                  guidanceEnabled ? "cursor-pointer accent-purple-600" : "cursor-not-allowed"
                                }`}
                                disabled={!guidanceEnabled}
                                style={{
                                  background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${checkDifficulty}%, #e5e7eb ${checkDifficulty}%, #e5e7eb 100%)`,
                                }}
                              />
                              <span
                                className={`text-lg font-semibold text-gray-900 min-w-[3rem] text-right ${poppins.className}`}
                              >
                                {checkDifficulty}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Content Scope Section */}
                    <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 sm:p-8">
                      <h3
                        className={`text-xl sm:text-2xl font-bold text-gray-900 mb-6 ${poppins.className}`}
                      >
                        Content Scope
                      </h3>
                      <div className="space-y-3 mb-6">
                        <p className={`text-sm text-gray-600 ${poppins.className}`}>
                          Choose how the assistant can use learning materials. This is a static preview, not connected
                          to backend enforcement.
                        </p>
                        <div className="space-y-2">
                          <label className={`text-sm font-semibold text-gray-800 ${poppins.className}`}>
                            Content usage mode
                          </label>
                          <select
                            value={contentScope}
                            onChange={(e) => setContentScope(e.target.value)}
                            className={`w-full px-4 py-3 bg-gray-50 border-2 border-gray-300 rounded-xl text-base font-medium text-gray-900 ${poppins.className} hover:border-purple-400 cursor-pointer`}
                          >
                            {scopeOptions.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                            <div className={`text-sm font-semibold text-gray-900 ${poppins.className}`}>
                              {scopeOptions.find((opt) => opt.key === contentScope)?.label}
                            </div>
                            <div className={`mt-1 text-sm text-gray-600 leading-5 ${poppins.className}`}>
                              {scopeOptions.find((opt) => opt.key === contentScope)?.description}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Focus Section */}
                      <div className="mb-8">
                        <h4
                          className={`text-lg font-semibold text-gray-800 mb-4 ${poppins.className}`}
                        >
                          Focus Section
                        </h4>
                        <p className={`text-sm text-gray-600 mb-3 ${poppins.className}`}>
                          Upload materials the assistant should prioritize when answering students.
                        </p>
                        <div className="space-y-3 mb-4">
                          {focusFiles.length > 0 ? (
                            focusFiles.map((file) => (
                              <div
                                key={file.id}
                                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedFocusFiles.has(file.id)}
                                  onChange={() => handleFocusFileToggle(file.id)}
                                  className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                />
                                <span className={`text-sm text-gray-700 flex-1 ${poppins.className}`}>
                                  {file.name}
                                </span>
                                <button
                                  onClick={() => handleDeleteFocusFile(file.id)}
                                  className="text-xs font-semibold text-red-600 hover:text-red-700"
                                >
                                  Delete
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className={`text-sm text-gray-500 ${poppins.className}`}>
                              No files uploaded yet
                            </p>
                          )}
                        </div>
                        <button
                          onClick={handleFocusFileUpload}
                          className="flex items-center gap-2 px-4 py-2 bg-green-50 border-2 border-green-300 rounded-xl hover:bg-green-100 hover:border-green-400 transition-colors"
                        >
                          <svg
                            className="w-5 h-5 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                          <span className={`text-sm font-medium text-green-700 ${poppins.className}`}>
                            Add example file
                          </span>
                        </button>
                      </div>

                      {/* Deny Section */}
                      <div>
                        <h4
                          className={`text-lg font-semibold text-gray-800 mb-4 ${poppins.className}`}
                        >
                          Deny Section
                        </h4>
                        <p className={`text-sm text-gray-600 mb-3 ${poppins.className}`}>
                          Upload files the assistant should avoid using to shape responses.
                        </p>
                        <div className="space-y-3 mb-4">
                          {denyFiles.length > 0 ? (
                            denyFiles.map((file) => (
                              <div
                                key={file.id}
                                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedDenyFiles.has(file.id)}
                                  onChange={() => handleDenyFileToggle(file.id)}
                                  className="w-5 h-5 text-red-600 border-gray-300 rounded focus:ring-red-500"
                                />
                                <span className={`text-sm text-gray-700 flex-1 ${poppins.className}`}>
                                  {file.name}
                                </span>
                                <button
                                  onClick={() => handleDeleteDenyFile(file.id)}
                                  className="text-xs font-semibold text-red-600 hover:text-red-700"
                                >
                                  Delete
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className={`text-sm text-gray-500 ${poppins.className}`}>
                              No files uploaded yet
                            </p>
                          )}
                        </div>
                        <button
                          onClick={handleDenyFileUpload}
                          className="flex items-center gap-2 px-4 py-2 bg-red-50 border-2 border-red-300 rounded-xl hover:bg-red-100 hover:border-red-400 transition-colors"
                        >
                          <svg
                            className="w-5 h-5 text-red-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                          <span className={`text-sm font-medium text-red-700 ${poppins.className}`}>
                            Add example file
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Test chat Button */}
                    <div className="flex justify-end pt-4">
                      <button
                        onClick={handleRunTestPrompt}
                        className="px-8 py-4 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-xl font-semibold hover:shadow-xl transition-all duration-300 hover:scale-105"
                      >
                        <span className={poppins.className}>Preview policy chat</span>
                      </button>
                    </div>
                  </div>
                </section>

                {/* Quiz Settings Group */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <h2 className={`text-xl sm:text-2xl font-bold text-gray-900 ${poppins.className}`}>
                        Quiz Settings
                      </h2>
                    </div>
                    <p className={`text-sm text-gray-600 ${poppins.className}`}>
                      Static preview of assessment and practice policies (not connected to backend).
                    </p>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Assessment basics */}
                    <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 sm:p-8 space-y-4">
                      <div>
                        <h3 className={`text-lg font-semibold text-gray-900 ${poppins.className}`}>
                          Assessment basics
                        </h3>
                        <p className={`text-sm text-gray-600 ${poppins.className}`}>
                          Set simple rules for graded quizzes.
                        </p>
                      </div>
                      <div className="space-y-3">
                        <label className="block">
                          <div className={`flex justify-between text-sm text-gray-700 ${poppins.className}`}>
                            <span>Quiz length (questions)</span>
                            <span className="text-gray-500">pick a target per quiz</span>
                          </div>
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={assessmentQuestions}
                            onChange={(e) => setAssessmentQuestions(Number(e.target.value) || 0)}
                            className="mt-1 w-full rounded-xl border-2 border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-blue-400"
                          />
                        </label>
                        <label className="block">
                          <div className={`flex justify-between text-sm text-gray-700 ${poppins.className}`}>
                            <span>Time limit per quiz (minutes)</span>
                            <span className="text-gray-500">leave room for thinking</span>
                          </div>
                          <input
                            type="number"
                            min={5}
                            max={480}
                            value={assessmentTimeLimit}
                            onChange={(e) => setAssessmentTimeLimit(Number(e.target.value) || 0)}
                            className="mt-1 w-full rounded-xl border-2 border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-blue-400"
                          />
                        </label>
                        <label className="block">
                          <div className={`flex justify-between text-sm text-gray-700 ${poppins.className}`}>
                            <span>Retake allowance</span>
                            <span className="text-gray-500">times a student can retry</span>
                          </div>
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={assessmentMaxAttempts}
                            onChange={(e) => setAssessmentMaxAttempts(Number(e.target.value) || 0)}
                            className="mt-1 w-full rounded-xl border-2 border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-blue-400"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Practice adaptivity */}
                    <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 sm:p-8 space-y-4">
                      <div>
                        <h3 className={`text-lg font-semibold text-gray-900 ${poppins.className}`}>
                          Practice adaptivity
                        </h3>
                        <p className={`text-sm text-gray-600 ${poppins.className}`}>
                          How quickly practice adjusts based on student streaks.
                        </p>
                      </div>
                      <div className="space-y-3">
                        <label className="block">
                          <div className={`flex justify-between text-sm text-gray-700 ${poppins.className}`}>
                            <span>Make it harder after</span>
                            <span className="text-gray-500">correct answers in a row</span>
                          </div>
                          <input
                            type="number"
                            min={1}
                            value={practiceIncreaseStreak}
                            onChange={(e) => setPracticeIncreaseStreak(Number(e.target.value) || 0)}
                            className="mt-1 w-full rounded-xl border-2 border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-blue-400"
                          />
                        </label>
                        <label className="block">
                          <div className={`flex justify-between text-sm text-gray-700 ${poppins.className}`}>
                            <span>Ease up after</span>
                            <span className="text-gray-500">incorrect answers in a row</span>
                          </div>
                          <input
                            type="number"
                            min={1}
                            value={practiceDecreaseStreak}
                            onChange={(e) => setPracticeDecreaseStreak(Number(e.target.value) || 0)}
                            className="mt-1 w-full rounded-xl border-2 border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-blue-400"
                          />
                        </label>
                        <label className="block">
                          <div className={`flex justify-between text-sm text-gray-700 ${poppins.className}`}>
                            <span>Repeat a missed question after</span>
                            <span className="text-gray-500">new questions served</span>
                          </div>
                          <input
                            type="number"
                            min={1}
                            value={missedQuestionGap}
                            onChange={(e) => setMissedQuestionGap(Number(e.target.value) || 0)}
                            className="mt-1 w-full rounded-xl border-2 border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-blue-400"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Question variety & sources */}
                    <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 sm:p-8 space-y-4 lg:col-span-2">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <h3 className={`text-lg font-semibold text-gray-900 ${poppins.className}`}>
                            Question variety & sources
                          </h3>
                          <p className={`text-sm text-gray-600 ${poppins.className}`}>
                            Decide how broadly questions pull from course slides and supporting snippets.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="block">
                          <div className={`flex justify-between text-sm text-gray-700 ${poppins.className}`}>
                            <span>Spread questions across the deck</span>
                            <span className="text-gray-500">{slideCoverageThreshold}% of slides before repeating</span>
                          </div>
                          <input
                            type="range"
                            min={10}
                            max={100}
                            step={5}
                            value={slideCoverageThreshold}
                            onChange={(e) => setSlideCoverageThreshold(Number(e.target.value) || 0)}
                            className="mt-2 w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            style={{
                              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${slideCoverageThreshold}%, #e5e7eb ${slideCoverageThreshold}%, #e5e7eb 100%)`,
                            }}
                          />
                        </label>

                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="block">
                            <div className={`flex justify-between text-sm text-gray-700 ${poppins.className}`}>
                              <span>Snippets to base each question on</span>
                              <span className="text-gray-500">smaller = more focused</span>
                            </div>
                            <input
                              type="number"
                              min={1}
                              value={retrieverSampleSize}
                              onChange={(e) => setRetrieverSampleSize(Number(e.target.value) || 0)}
                              className="mt-1 w-full rounded-xl border-2 border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-blue-400"
                            />
                          </label>
                          <label className="block">
                            <div className={`flex justify-between text-sm text-gray-700 ${poppins.className}`}>
                              <span>Search breadth (top matches to consider)</span>
                              <span className="text-gray-500">higher = wider net</span>
                            </div>
                            <input
                              type="number"
                              min={4}
                              value={retrieverTopK}
                              onChange={(e) => setRetrieverTopK(Number(e.target.value) || 0)}
                              className="mt-1 w-full rounded-xl border-2 border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-blue-400"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative Right Panel */}
        <div className="hidden lg:block lg:w-40 xl:w-72 2xl:w-80 bg-purple-100 border-l border-gray-300 relative z-20" />
      </div>

      {/* Gradients */}
      <img src="/gradient1.png" alt="Gradient decoration" className="fixed bottom-0 left-0 w-40 sm:w-56 lg:w-72 z-20" />

      {/* Click outside to close dropdown */}
    </div>
  );
}
