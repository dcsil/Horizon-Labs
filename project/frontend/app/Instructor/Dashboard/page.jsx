"use client";

import { useEffect, useMemo, useState } from "react";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const QUIZ_ANALYTICS_ENDPOINT = `${API_BASE_URL}/analytics/quizzes`;
const CHAT_ANALYTICS_ENDPOINT = `${API_BASE_URL}/analytics/chats`;

const heroTitleClasses = `text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-3 ${poppins.className}`;
const heroSubtitleClasses = `text-base sm:text-lg text-gray-500 ${poppins.className}`;

const MAX_MONTH_HISTORY = 4;

const normaliseUTCDate = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const getDateKey = (date) => {
  const normalised = normaliseUTCDate(date);
  return normalised.toISOString().split("T")[0];
};

const formatDateShort = (date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const formatDateRangeLabel = (start, end) => {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return "--";
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) return formatDateShort(start);
  const startLabel = formatDateShort(start);
  const endLabel = formatDateShort(end);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
};

const getStartOfWeek = (date) => {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = utcDate.getUTCDay();
  utcDate.setUTCDate(utcDate.getUTCDate() - dayOfWeek);
  return utcDate;
};


const formatPercent = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  const clamped = Math.min(Math.max(value, 0), 1);
  return Math.round(clamped * 100);
};

const getTopicLabel = (topic) => {
  if (typeof topic === "string" && topic.trim()) {
    return topic;
  }
  return "General";
};

export default function InstructorDashboard() {
  const [quizAnalytics, setQuizAnalytics] = useState(null);
  const [quizFetchedAt, setQuizFetchedAt] = useState(null);
  const [isQuizLoading, setIsQuizLoading] = useState(true);
  const [quizError, setQuizError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchQuizAnalytics = async () => {
      setIsQuizLoading(true);
      setQuizError(null);
      try {
        const response = await fetch(QUIZ_ANALYTICS_ENDPOINT);
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.detail || "Unable to load quiz analytics.");
        }
        const data = await response.json();
        if (!isMounted) return;
        setQuizAnalytics(data);
        setQuizFetchedAt(new Date().toISOString());
      } catch (err) {
        if (!isMounted) return;
        setQuizError(err instanceof Error ? err.message : "Unable to load quiz analytics.");
      } finally {
        if (isMounted) {
          setIsQuizLoading(false);
        }
      }
    };

    fetchQuizAnalytics();

    return () => {
      isMounted = false;
    };
  }, []);

  const practiceQuizzes = Array.isArray(quizAnalytics?.quizzes) ? quizAnalytics.quizzes : [];

  const aggregateQuizStats = useMemo(() => {
    const totalSessions = quizAnalytics?.total_sessions ?? 0;
    const averageAccuracy = formatPercent(quizAnalytics?.average_accuracy ?? 0);
    const averageQuestions = quizAnalytics?.average_questions ?? 0;
    const totalQuestions = totalSessions && averageQuestions ? Math.round(totalSessions * averageQuestions) : 0;
    return { averageAccuracy, totalSessions, totalQuestions };
  }, [quizAnalytics]);

  const formattedGeneratedAt = useMemo(() => {
    if (!quizFetchedAt) return "--";
    const date = new Date(quizFetchedAt);
    if (Number.isNaN(date.getTime())) return quizFetchedAt;
    return date.toLocaleString();
  }, [quizFetchedAt]);

  const [chatAnalytics, setChatAnalytics] = useState(null);
  const [isChatLoading, setIsChatLoading] = useState(true);
  const [chatError, setChatError] = useState(null);
  const [chatViewMode, setChatViewMode] = useState("week");
  const [weekCursor, setWeekCursor] = useState(0);
  const [monthCursor, setMonthCursor] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const fetchChatAnalytics = async () => {
      setIsChatLoading(true);
      setChatError(null);
      try {
        const response = await fetch(CHAT_ANALYTICS_ENDPOINT);
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.detail || "Unable to load chat analytics.");
        }
        const data = await response.json();
        if (!isMounted) return;
        setChatAnalytics(data);
      } catch (err) {
        if (!isMounted) return;
        setChatError(err instanceof Error ? err.message : "Unable to load chat analytics.");
      } finally {
        if (isMounted) {
          setIsChatLoading(false);
        }
      }
    };

    fetchChatAnalytics();

    return () => {
      isMounted = false;
    };
  }, []);

  const processedDailyTrend = useMemo(() => {
    if (!chatAnalytics) {
      return [];
    }
    const sourceTrend = Array.isArray(chatAnalytics.daily_trend) ? chatAnalytics.daily_trend : [];
    const normalisedDays = sourceTrend
      .map((day) => {
        const dateObj = new Date(day.date);
        if (Number.isNaN(dateObj.getTime())) {
          return null;
        }
        const totalTurns = typeof day.total === "number" ? day.total : (day.good || 0) + (day.needs_focusing || 0);
        const normalisedDate = normaliseUTCDate(dateObj);
        return {
          ...day,
          dateObj: normalisedDate,
          total: totalTurns,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.dateObj - b.dateObj);

    const daysByKey = new Map();
    normalisedDays.forEach((day) => {
      daysByKey.set(getDateKey(day.dateObj), day);
    });

    const today = normaliseUTCDate(new Date());
    const latestRecorded = normalisedDays.length ? normalisedDays[normalisedDays.length - 1].dateObj : null;
    const rangeEnd = latestRecorded && latestRecorded > today ? latestRecorded : today;
    const rangeStart = new Date(Date.UTC(rangeEnd.getUTCFullYear(), rangeEnd.getUTCMonth() - MAX_MONTH_HISTORY, 1));

    const filledDays = [];
    for (let cursor = new Date(rangeStart); cursor <= rangeEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const cursorDate = normaliseUTCDate(cursor);
      const key = getDateKey(cursorDate);
      const existing = daysByKey.get(key);
      if (existing) {
        filledDays.push(existing);
        continue;
      }
      filledDays.push({
        date: key,
        good: 0,
        needs_focusing: 0,
        total: 0,
        dateObj: cursorDate,
      });
    }
    return filledDays;
  }, [chatAnalytics]);

  const weeklyBuckets = useMemo(() => {
    if (processedDailyTrend.length === 0) {
      return [];
    }
    const map = new Map();
    processedDailyTrend.forEach((day) => {
      const weekStart = getStartOfWeek(day.dateObj);
      const key = weekStart.toISOString();
      if (!map.has(key)) {
        map.set(key, {
          key,
          startDate: weekStart,
          endDate: weekStart,
          days: [],
        });
      }
      const bucket = map.get(key);
      bucket.days.push(day);
      if (day.dateObj > bucket.endDate) {
        bucket.endDate = day.dateObj;
      }
    });
    const buckets = Array.from(map.values());
    buckets.forEach((bucket) => bucket.days.sort((a, b) => a.dateObj - b.dateObj));
    buckets.sort((a, b) => b.startDate - a.startDate);
    return buckets;
  }, [processedDailyTrend]);

  const monthlyBuckets = useMemo(() => {
    if (weeklyBuckets.length === 0) {
      return [];
    }
    const map = new Map();
    weeklyBuckets.forEach((week) => {
      const monthDistribution = week.days.reduce((acc, day) => {
        const monthKey = `${day.dateObj.getUTCFullYear()}-${day.dateObj.getUTCMonth()}`;
        acc[monthKey] = (acc[monthKey] || 0) + 1;
        return acc;
      }, {});
      const [primaryMonthKey] = Object.entries(monthDistribution).sort((a, b) => {
        if (b[1] === a[1]) {
          return b[0].localeCompare(a[0]);
        }
        return b[1] - a[1];
      })[0] || [`${week.startDate.getUTCFullYear()}-${week.startDate.getUTCMonth()}`];
      const [primaryYear, primaryMonth] = primaryMonthKey.split("-").map((part) => Number(part));
      const monthDate = new Date(Date.UTC(primaryYear, primaryMonth, 1));
      const key = monthDate.toISOString();
      if (!map.has(key)) {
        map.set(key, {
          key,
          monthDate,
          label: monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
          weeks: [],
        });
      }
      const good = week.days.reduce((sum, day) => sum + (day.good || 0), 0);
      const needs = week.days.reduce((sum, day) => sum + (day.needs_focusing || 0), 0);
      map.get(key).weeks.push({
        key: `${week.startDate.toISOString()}-${week.endDate.toISOString()}`,
        label: formatDateRangeLabel(week.startDate, week.endDate),
        startDate: week.startDate,
        endDate: week.endDate,
        good,
        needs_focusing: needs,
        total: good + needs,
      });
    });
    const months = Array.from(map.values());
    months.forEach((month) => month.weeks.sort((a, b) => a.startDate - b.startDate));
    months.sort((a, b) => b.monthDate - a.monthDate);
    return months;
  }, [weeklyBuckets]);

  useEffect(() => {
    setWeekCursor(0);
  }, [weeklyBuckets.length]);

  useEffect(() => {
    setMonthCursor(0);
  }, [monthlyBuckets.length]);

  useEffect(() => {
    if (chatViewMode === "week") {
      setWeekCursor(0);
    } else {
      setMonthCursor(0);
    }
  }, [chatViewMode]);

  const currentWeek = weeklyBuckets[weekCursor] || null;
  const currentMonth = monthlyBuckets[monthCursor] || null;

  const weekChartData = useMemo(() => {
    if (!currentWeek) {
      return [];
    }
    return currentWeek.days.map((day) => ({
      key: day.date,
      label: formatDateShort(day.dateObj),
      good: day.good || 0,
      needs_focusing: day.needs_focusing || 0,
      total: day.total || 0,
    }));
  }, [currentWeek]);

  const monthChartData = useMemo(() => {
    if (!currentMonth) {
      return [];
    }
    return currentMonth.weeks.map((week) => ({
      key: week.key,
      label: week.label,
      good: week.good,
      needs_focusing: week.needs_focusing,
      total: week.total,
    }));
  }, [currentMonth]);

  const chartBarData = chatViewMode === "week" ? weekChartData : monthChartData;

  const chatTotals = useMemo(() => {
    if (chartBarData.length === 0) {
      const fallbackTotals = chatAnalytics?.totals;
      if (fallbackTotals) {
        const total = fallbackTotals.good + fallbackTotals.needs_focusing;
        return {
          good: fallbackTotals.good,
          needs: fallbackTotals.needs_focusing,
          total,
          goodPercent: total ? Math.round((fallbackTotals.good / total) * 100) : 0,
        };
      }
      return { good: 0, needs: 0, total: 0, goodPercent: 0 };
    }

    const good = chartBarData.reduce((sum, entry) => sum + (entry.good || 0), 0);
    const needs = chartBarData.reduce((sum, entry) => sum + (entry.needs_focusing || 0), 0);
    const total = good + needs;
    return { good, needs, total, goodPercent: total ? Math.round((good / total) * 100) : 0 };
  }, [chartBarData, chatAnalytics]);

  const maxDailyValue = useMemo(() => {
    if (chartBarData.length === 0) return 1;
    return Math.max(
      ...chartBarData.map((entry) =>
        typeof entry.total === "number" ? entry.total : (entry.good || 0) + (entry.needs_focusing || 0)
      ),
      1
    );
  }, [chartBarData]);

  const rangeLabel = useMemo(() => {
    if (chatViewMode === "week") {
      return currentWeek ? `Week of ${formatDateRangeLabel(currentWeek.startDate, currentWeek.endDate)}` : "No week data";
    }
    return currentMonth ? currentMonth.label : "No month data";
  }, [chatViewMode, currentWeek, currentMonth]);

  const canGoOlderWeek = weekCursor < weeklyBuckets.length - 1;
  const canGoNewerWeek = weekCursor > 0;
  const canGoOlderMonth = monthCursor < monthlyBuckets.length - 1;
  const canGoNewerMonth = monthCursor > 0;

  const goPreviousRange = () => {
    if (chatViewMode === "week" && canGoOlderWeek) {
      setWeekCursor((prev) => Math.min(prev + 1, weeklyBuckets.length - 1));
    }
    if (chatViewMode === "month" && canGoOlderMonth) {
      setMonthCursor((prev) => Math.min(prev + 1, monthlyBuckets.length - 1));
    }
  };

  const goNextRange = () => {
    if (chatViewMode === "week" && canGoNewerWeek) {
      setWeekCursor((prev) => Math.max(prev - 1, 0));
    }
    if (chatViewMode === "month" && canGoNewerMonth) {
      setMonthCursor((prev) => Math.max(prev - 1, 0));
    }
  };

  const chatSessionCount = chatAnalytics?.session_count ?? 0;
  const classifiedTurns = chatAnalytics?.classified_turns ?? 0;
  const chatAverageTurns = chatAnalytics?.average_turns_per_session ?? 0;
  const classificationRate = chatAnalytics?.classification_rate ?? 0;

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <div className="flex h-full min-h-screen flex-col xl:flex-row">
        <div className="hidden xl:block w-80 bg-white border-r border-[#9690B7] relative z-10" />

        <div className="flex-1 bg-white relative z-10">
          <div className="min-h-[calc(100vh-4rem)] flex flex-col px-6 py-10 sm:px-10 lg:px-16">
            <div className="flex flex-col max-w-5xl pt-10 sm:pt-12 lg:pt-16 gap-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h1 className={heroTitleClasses}>Analytics Dashboard</h1>
                  <p className={heroSubtitleClasses}>
                    Track practice quiz performance alongside adaptive chat quality to guide instruction.
                  </p>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-4">
                <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-purple-50 to-white p-6 shadow-sm">
                  <p className={`text-sm text-gray-500 ${poppins.className}`}>Tracked Quizzes</p>
                  <p className={`text-3xl font-semibold text-gray-900 mt-2 ${poppins.className}`}>
                    {isQuizLoading ? "--" : practiceQuizzes.length}
                  </p>
                  <p className={`text-sm text-gray-500 mt-2 ${poppins.className}`}>
                    {isQuizLoading ? "Gathering sessions…" : `${aggregateQuizStats.totalSessions} sessions reviewed`}
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
                  <p className={`text-sm text-gray-500 ${poppins.className}`}>Average Accuracy</p>
                  <p className={`text-3xl font-semibold text-gray-900 mt-2 ${poppins.className}`}>
                    {isQuizLoading ? "--" : `${aggregateQuizStats.averageAccuracy}%`}
                  </p>
                  <p className={`text-sm text-gray-500 mt-2 ${poppins.className}`}>
                    Share of questions answered correctly.
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm">
                  <p className={`text-sm text-gray-500 ${poppins.className}`}>Last Updated</p>
                  <p className={`text-lg font-medium text-gray-900 mt-2 ${poppins.className}`}>
                    {isQuizLoading ? "Loading…" : formattedGeneratedAt}
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-indigo-50 to-white p-6 shadow-sm">
                  <p className={`text-sm text-gray-500 ${poppins.className}`}>Chat Sessions</p>
                  <p className={`text-3xl font-semibold text-gray-900 mt-2 ${poppins.className}`}>
                    {isChatLoading ? "--" : chatSessionCount}
                  </p>
                  <p className={`text-sm text-gray-500 mt-2 ${poppins.className}`}>
                    {isChatLoading
                      ? "Examining conversations…"
                      : `${classifiedTurns.toLocaleString()} labelled turns · ${(classificationRate * 100).toFixed(0)}% classification rate`}
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className={`text-xl font-semibold text-gray-900 ${poppins.className}`}>
                      Practice Quiz Performance
                    </h2>
                    <p className={`text-sm text-gray-500 ${poppins.className}`}>
                      Accuracy and topic insights derived from learner sessions.
                    </p>
                  </div>
                  {!isQuizLoading && practiceQuizzes.length > 0 && (
                    <div className="text-sm text-gray-500">
                      {aggregateQuizStats.totalQuestions > 0
                        ? `${aggregateQuizStats.totalQuestions.toLocaleString()} questions graded`
                        : "Question counts vary per quiz"}
                    </div>
                  )}
                </div>

                {quizError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{quizError}</div>
                ) : (
                  <div className="space-y-5">
                    {isQuizLoading ? (
                      <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">
                        Loading practice quiz analytics…
                      </div>
                    ) : practiceQuizzes.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">
                        No quiz attempts recorded yet.
                      </div>
                    ) : (
                      practiceQuizzes.map((quiz) => {
                        const quizKey = quiz.quiz_id || quiz.name || "unknown";
                        const accuracyPercent = formatPercent(quiz.average_accuracy ?? 0);
                        const totalTopics = Array.isArray(quiz.topics) ? quiz.topics : [];
                        const totalAttempts = totalTopics.reduce((sum, topic) => sum + (topic.attempted || 0), 0);
                        const totalCorrect = totalTopics.reduce((sum, topic) => sum + (topic.correct || 0), 0);

                        return (
                          <div
                            key={quizKey}
                            className="rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-gray-50 p-5 shadow-inner"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <h3 className={`text-lg font-semibold text-gray-900 ${poppins.className}`}>
                                  {quiz.name || quiz.quiz_id || "Untitled quiz"}
                                </h3>
                                <p className={`text-sm text-gray-500 ${poppins.className}`}>
                                  {`${quiz.total_sessions || 0} sessions · avg ${Math.round(quiz.average_questions || 0)} questions · ${totalCorrect}/${totalAttempts || 0} correct`}
                                </p>
                              </div>
                              <div className="text-3xl font-semibold text-emerald-600">{accuracyPercent}%</div>
                            </div>
                            <div className="mt-4 h-3 w-full rounded-full bg-gray-200/70">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-blue-500 to-indigo-500 transition-all"
                                style={{ width: `${accuracyPercent}%` }}
                              />
                            </div>
                            {totalTopics.length > 0 ? (
                              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                {totalTopics.map((topic) => {
                                  const topicPercent = formatPercent(topic.accuracy ?? 0);
                                  const topicKey = `${quizKey}-${getTopicLabel(topic.topic)}`;
                                  return (
                                    <div
                                      key={topicKey}
                                      className="rounded-xl border border-gray-100 bg-white/80 p-3 shadow-sm"
                                    >
                                      <div className="flex items-center justify-between text-sm font-medium text-gray-900">
                                        <span>{getTopicLabel(topic.topic)}</span>
                                        <span>{topicPercent}%</span>
                                      </div>
                                      <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
                                        <div
                                          className="h-full rounded-full bg-gradient-to-r from-purple-400 to-indigo-500"
                                          style={{ width: `${topicPercent}%` }}
                                        />
                                      </div>
                                      <p className="mt-1 text-xs text-gray-500">
                                        {(topic.correct || 0).toLocaleString()}/{(topic.attempted || 0).toLocaleString()} correct
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="mt-4 rounded-xl border border-dashed border-gray-200 p-3 text-sm text-gray-500">
                                Topic-level insights will appear after learners answer classified questions.
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className={`text-xl font-semibold text-gray-900 ${poppins.className}`}>
                      Adaptive Chat Quality (Cumulative)
                    </h2>
                    <p className={`text-sm text-gray-500 ${poppins.className}`}>
                      Totals of good vs. needs_focusing classifications for the selected window.
                    </p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {isChatLoading ? "Loading…" : `${chatTotals.goodPercent}% of turns marked as good`}
                  </div>
                </div>

                {chatError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{chatError}</div>
                ) : (
                  <div className="flex flex-col items-center gap-6">
                    <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-6 shadow-inner flex flex-col items-center justify-center">
                      {isChatLoading ? (
                        <div className="text-sm text-gray-500">Loading chart…</div>
                      ) : chatTotals.total === 0 ? (
                        <div className="text-sm text-gray-500">No labelled turns yet.</div>
                      ) : (
                        <svg viewBox="0 0 200 200" className="w-56 h-56">
                          {(() => {
                            const goodAngle = (chatTotals.good / chatTotals.total) * 360;
                            const needsAngle = 360 - goodAngle;
                            const describeArc = (startAngle, sweep, color) => {
                              const radius = 90;
                              const center = 100;
                              const start = ((startAngle - 90) * Math.PI) / 180;
                              const end = ((startAngle + sweep - 90) * Math.PI) / 180;
                              const startX = center + radius * Math.cos(start);
                              const startY = center + radius * Math.sin(start);
                              const endX = center + radius * Math.cos(end);
                              const endY = center + radius * Math.sin(end);
                              const largeArc = sweep > 180 ? 1 : 0;
                              return (
                                <path
                                  d={`M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`}
                                  fill={color}
                                  opacity={0.92}
                                />
                              );
                            };
                            return (
                              <>
                                {describeArc(0, goodAngle, "url(#goodGradient)")}
                                {describeArc(goodAngle, needsAngle, "url(#needsGradient)")}
                                <defs>
                                  <linearGradient id="goodGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#34d399" />
                                    <stop offset="100%" stopColor="#10b981" />
                                  </linearGradient>
                                  <linearGradient id="needsGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#fbbf24" />
                                    <stop offset="100%" stopColor="#f97316" />
                                  </linearGradient>
                                </defs>
                              </>
                            );
                          })()}
                        </svg>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
                        <span>Good turns: {isChatLoading ? "--" : chatTotals.good.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
                        <span>Needs focusing: {isChatLoading ? "--" : chatTotals.needs.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500">
                        <span className="inline-block h-3 w-3 rounded-full bg-slate-300" />
                        <span>Total labelled turns: {isChatLoading ? "--" : chatTotals.total.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}

                {!chatError && !isChatLoading && (
                  <div className="mt-8 w-full">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                      <div>
                        <h3 className={`text-lg font-semibold text-gray-900 ${poppins.className}`}>
                          Daily Turn Classifications
                        </h3>
                        <p className="text-xs text-gray-500">Swipe between live week slices or month aggregates.</p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setChatViewMode("week")}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              chatViewMode === "week" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            } ${poppins.className}`}
                          >
                            Week
                          </button>
                          <button
                            onClick={() => setChatViewMode("month")}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              chatViewMode === "month" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            } ${poppins.className}`}
                          >
                            Month
                          </button>
                        </div>
                        <div className="flex items-center justify-end gap-2 text-sm text-gray-600">
                          <button
                            type="button"
                            onClick={goPreviousRange}
                            disabled={chatViewMode === "week" ? !canGoOlderWeek : !canGoOlderMonth}
                            className={`h-9 w-9 rounded-full border border-gray-200 flex items-center justify-center transition-colors ${
                              (chatViewMode === "week" ? !canGoOlderWeek : !canGoOlderMonth)
                                ? "text-gray-300"
                                : "text-gray-600 hover:bg-gray-100"
                            }`}
                            aria-label="View previous interval"
                          >
                            ←
                          </button>
                          <span className="min-w-[140px] text-right text-xs sm:text-sm font-medium text-gray-700">
                            {rangeLabel}
                          </span>
                          <button
                            type="button"
                            onClick={goNextRange}
                            disabled={chatViewMode === "week" ? !canGoNewerWeek : !canGoNewerMonth}
                            className={`h-9 w-9 rounded-full border border-gray-200 flex items-center justify-center transition-colors ${
                              (chatViewMode === "week" ? !canGoNewerWeek : !canGoNewerMonth)
                                ? "text-gray-300"
                                : "text-gray-600 hover:bg-gray-100"
                            }`}
                            aria-label="View next interval"
                          >
                            →
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-6">
                      {chartBarData.length === 0 ? (
                        <div className="text-sm text-gray-500 text-center py-8">No daily data available.</div>
                      ) : (
                        <div className="flex h-64 items-end gap-2 overflow-x-auto overflow-y-visible pb-4 pt-8">
                          {chartBarData.map((entry) => {
                            const good = entry.good || 0;
                            const needs = entry.needs_focusing || 0;
                            const maxBarHeight = 200;
                            const goodHeight = maxDailyValue > 0 ? (good / maxDailyValue) * maxBarHeight : 0;
                            const needsHeight = maxDailyValue > 0 ? (needs / maxDailyValue) * maxBarHeight : 0;

                            return (
                              <div key={entry.key} className="flex flex-col items-center flex-1 min-w-[60px] gap-2">
                                <div className="relative w-full h-52 flex items-end justify-center gap-1.5 bg-gradient-to-t from-gray-50 to-white rounded-xl border border-gray-100 p-2">
                                  <div className="flex flex-col items-center justify-end flex-1 h-full relative">
                                    <span className="text-xs font-medium text-gray-600 text-center">{good}</span>
                                    <div
                                      className="w-full rounded-t-lg bg-gradient-to-t from-emerald-500 to-emerald-400 shadow-sm transition-all duration-300 hover:opacity-90"
                                      style={{ height: `${Math.max(goodHeight, good > 0 ? 8 : 0)}px` }}
                                      title={`Good turns: ${good}`}
                                    />
                                  </div>
                                  <div className="flex flex-col items-center justify-end flex-1 h-full relative">
                                    <span className="text-xs font-medium text-gray-600 text-center">{needs}</span>
                                    <div
                                      className="w-full rounded-t-lg bg-gradient-to-t from-amber-500 to-amber-400 shadow-sm transition-all duration-300 hover:opacity-90"
                                      style={{ height: `${Math.max(needsHeight, needs > 0 ? 8 : 0)}px` }}
                                      title={`Needs focusing: ${needs}`}
                                    />
                                  </div>
                                </div>
                                <span className="text-xs font-medium text-gray-600 text-center">{entry.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="mt-4 flex items-center justify-center gap-6 text-xs text-gray-500">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded bg-emerald-500" />
                          <span>Good turns</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded bg-amber-500" />
                          <span>Needs focusing</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:block lg:w-40 xl:w-72 2xl:w-80 bg-purple-100 border-l border-gray-300 relative z-20" />
      </div>

      <img src="/gradient1.png" alt="Gradient decoration" className="fixed bottom-0 left-0 w-40 sm:w-56 lg:w-72 z-20" />
    </div>
  );
}
