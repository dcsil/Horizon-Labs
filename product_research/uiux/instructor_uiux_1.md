# LearnLLM UI/UX Design Overview (Instructor-Facing View - Quiz UI Flow)

## Introduction

Purpose: The instructor interface of LearnLLM allows educators to seamlessly generate quizzes from uploaded lecture materials or configure them manually through either Assessment or Practice modes. The goal is to empower instructors to transform their teaching content into interactive, adaptive quizzes that assess student understanding and engagement while minimizing setup friction.

Design Tool Used: Figma

Design Principles: Clarity, minimal cognitive load, accessibility, and responsive design.

## User Flow Summary

Entry Point: Instructor logs into the system and lands on the dashboard.
Core Flow: Login → Instructor Dashboard → Create New Quiz → Select Mode/Upload Slides → Configure Quiz → Preview → Publish → My Quizzes → View/Edit/Manage

## Frame-by-Frame Design Explanation

<img width="1005" height="650" alt="image" src="https://github.com/user-attachments/assets/5188d0b0-07a0-4e49-871d-5f17881c5e4e" />

### Frame 1 - Instructor Dashboard (Welcome Screen)

Purpose: Provides instructors with a central hub to begin creating quizzes or view their existing ones.

Key Elements:
- Greeting header: “Welcome Instructor”
- Button: “Create a Quiz”
- Date and time indicator for context

UX Explanation: This serves as a clean entry point for instructors, focusing attention on the primary action (creating a quiz). The minimal layout avoids overwhelming users and reinforces clarity and ease of use.

<img width="1239" height="809" alt="image" src="https://github.com/user-attachments/assets/14f5a976-4152-45ea-ab8e-cc06a2c2357d" />

### Frame 2 - Create a New Quiz (Mode Selection + Upload Slides)

Purpose: Allows instructors to choose how they want to create their quiz: manually or via automatic generation from uploaded slides.

Key Elements:
- Title: “Create a New Quiz”
- Two primary mode buttons:
1. Assessment Mode: Limited attempts, graded quizzes
2. Practice Mode: Unlimited attempts, ungraded quizzes
- Upload Slides Feature: “Upload slides to auto-generate questions” option between the two mode buttons
- “Next” button to continue

UX Explanation: This frame reduces decision fatigue by centralizing all quiz-creation entry points. Instructors can either configure structured quizzes or accelerate creation by uploading slides. The iconography (graduation cap) and consistent button color gradients build visual hierarchy while maintaining a friendly academic tone.

<img width="1250" height="1031" alt="image" src="https://github.com/user-attachments/assets/006ddb60-3f22-49e4-b516-61eabd9de312" />

### Frame 3 - Assessment Mode Configuration

Purpose: Set up a graded quiz with constraints and topic coverage.

Key Elements:
- Input fields for:
1. Number of Attempts
2. Number of Questions
3. Time Limit
4. Difficulty Level
- Topic Configuration field (“Topics to Test”)
- Buttons:
1. “Preview Quiz” (purple)
2. “Publish Quiz” (gold)

UX Explanation: A structured form ensures control over quiz constraints while keeping inputs minimal. The color differentiation between Preview and Publish provides clear next-step guidance and avoids accidental submissions.

<img width="1241" height="839" alt="image" src="https://github.com/user-attachments/assets/ef81025b-f82c-4b1c-ad43-5dec150489dd" />

### Frame 4 - Practice Mode Configuration

Purpose: Configure a non-graded practice quiz without attempt or time restrictions.

Key Elements:
- Topic Configuration field (“Topics to Test”)
- Buttons:
1. “Preview Quiz”
2. “Publish Quiz”

UX Explanation: Simplified input form focuses on fast quiz creation. By removing extra parameters like time limits, instructors can emphasize learning and revision without cognitive overload.

<img width="1263" height="832" alt="image" src="https://github.com/user-attachments/assets/b5120d77-cf1c-4f4d-859f-24ff6dec4259" />

### Frame 5 - Question View (Student Quiz Simulation)

Purpose: Preview how a student would see and answer quiz questions.

Key Elements:
- Question display
- Four multiple-choice options
- Progress bar at bottom
- “Submit Answer” button

UX Explanation: Mirrors the student-facing experience to let instructors verify flow and difficulty. The progress bar provides continuous feedback and encourages engagement.

<img width="1252" height="826" alt="image" src="https://github.com/user-attachments/assets/0a979cf1-57ce-4f04-a2e8-2575d975d8fa" />

### Frame 6 - Answer Feedback Screen

Purpose: Displays which answer was selected and whether it was correct.

Key Elements:
- Highlighted correct/incorrect answer
- “Next Question” or “Submit Answer” button

UX Explanation: Provides immediate feedback for usability testing during quiz creation. Consistent card layouts minimize visual shift between question states.

<img width="978" height="650" alt="image" src="https://github.com/user-attachments/assets/4e9d9eaa-a546-4e0b-83d2-b96aa3297521" />

### Frame 7 - Quiz Results Screen

Purpose: Shows summarized quiz performance once the quiz is completed.

Key Elements:
- Circular score visualization (e.g., “Your Score: 100%”)
- Buttons:
1. “Retake Quiz”
2. “Return to Home”

UX Explanation: Simple positive reinforcement helps instructors test the feedback loop and verify scoring mechanisms. Large circular visualization draws attention to performance metrics without excessive text.

<img width="981" height="813" alt="image" src="https://github.com/user-attachments/assets/cd99d775-e978-400f-a570-2edabb1bd0dd" />

### Frame 8 - My Quizzes (Empty State)

Purpose: Displays instructor’s existing quizzes or prompts quiz creation if none exist.

Key Elements:
- Box with message: “Quizzes you create will appear here”
- “Create a Quiz” button

UX Explanation: Encourages immediate engagement even in blank states. The illustration adds friendliness to what might otherwise feel like a dead end.

<img width="1107" height="922" alt="image" src="https://github.com/user-attachments/assets/0c65c600-69e5-446b-aece-f3394208bcba" />

### Frame 9 - My Quizzes (List View + Editing)

Purpose: Allow instructors to manage, edit, and preview published quizzes.

Key Elements:
- List of created quizzes with titles (e.g., “Quiz 1: Heap Fundamentals”)
- Buttons:
1. “Edit Quiz”
2. “Preview Quiz”
- Highlighted active quiz when selected

UX Explanation: Prioritizes efficiency. The two-button layout supports clear edit vs. preview intent, and the highlighted selection state provides visual confirmation of focus.
