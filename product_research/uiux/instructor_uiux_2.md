# LearnLLM UI/UX Design Overview (Instructor-Facing View - Analytics Dashboard and LLM TA Flow)

## Introduction

Purpose: The updated instructor interface in LearnLLM provides educators with real-time classroom insights and a conversational LLM “TA” to quickly understand student struggles, explore topic-level analytics, and receive actionable teaching support. The goal is to centralize performance data, simplify navigation, and offer a seamless chat-driven assistant that helps instructors interpret student trends and plan interventions.

Design Tool Used: Figma

Design Principles: Visual hierarchy, academic-friendly gradients, cognitive simplicity, conversational flow, and modular dashboard components that adapt to performance and instructor usage patterns.

## User Flow Summary

Entry Point: Instructor logs in and lands on the analytics dashboard.
Core Flow: Login → Instructor Dashboard → Open LLM TA → Enter Prompt → View Summary/Insights → Recommended Topics → Continue Chat

## Frame-by-Frame Design Explanation

<img width="900" height="988" alt="image" src="https://github.com/user-attachments/assets/d91593ce-817b-4b05-8c17-52d0c745ce8e" />

### Frame 1 - Instructor Analytics Dashboard (Welcome Screen)

Purpose: To give instructors a centralized snapshot of classroom health including student activity, average quiz performance, and the highest-struggle subtopic. Also serves as a quick access point to the Quiz Generator and the LLM TA.

Key Elements:
- Header: “Welcome Instructor”
- Date Stamp: Contextual daily reference for weekly insights
- Primary Actions:
  - Two Quiz Generator buttons (for different creation paths)
  - LLM TA Card for direct conversational assistance
- Course Overview Metrics (placeholder)
  - Active Students This Week
  - Average Quiz Score (All Quizzes)
  - Highest Struggle Subtopic (e.g., DP – Memoization)
- Performance Overview section:
  - Placeholder Quiz Score Trend Chart
  - Two donut components showing average scores for student groups

UX Explanation: The dashboard is intentionally card-driven for scanability. Users immediately see what needs attention (struggling subtopics), what’s going well (average scores), and where to act next (quiz generation or AI help). High-contrast gradients emphasize importance without overwhelming the user, and the modular layout supports scale as more analytics are added.

<img width="1362" height="882" alt="image" src="https://github.com/user-attachments/assets/bc0def0f-1e36-4ccb-902c-cb8b42905a54" />

### Frame 2 - LLM TA Intro Screen (Empty State + Prompt Input)

Purpose: To let instructors ask instructional, performance, or content-related questions directly to the LLM TA in a clean, distraction-free environment.

Key Elements:
- Centered LLM TA Icon + Name
- Prompt Input Box with placeholder query (e.g., “What are common confusions about x?”)
- Thinking indicator (shows the system is processing)
- Submit Button aligned to the right
- Recommended Topics section with category chips (e.g., Web Dev, Data Structures, Python)

UX Explanation: This frame sets a calm, chat-first tone. The empty-state hero layout focuses attention on the input box while still offering light guidance through recommended topics. The chips provide low-effort entry points and help prevent prompt paralysis. The abundant white space reinforces clarity and reduces cognitive load.

<img width="1357" height="889" alt="image" src="https://github.com/user-attachments/assets/9eafb1d8-afea-430e-85d4-eefe1cc34ff5" />

### Frame 3 - LLM TA Active Chat

Purpose: To display the ongoing conversation, summarizing student performance insights or recommendations based on instructor queries.

Key Elements:
- Message Bubbles:
  - Instructor prompt (aligned right)
  - LLM TA responses (aligned left)
- Timestamp beside the LLM TA messages
- Persistent Prompt Bar at bottom with:
  - New prompt field (“What do you need help with today?”)
  - “Thinking” indicator
  - Submit button

UX Explanation: This frame mirrors familiar chat UIs to reduce friction. The separation of instructor vs. AI responses provides clarity. The persistent, soft-background input bar encourages iterative conversations, allowing instructors to build on insights naturally. The conversational structure supports deeper context building, making the LLM TA feel like a true teaching assistant rather than a static tool.
