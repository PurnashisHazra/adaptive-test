import type { ReactNode } from "react";
import type { PaperSessionMeta, QuestionStudent } from "../api/types";
import { formatExamTimer, formatQuestionParagraphs, isNumberedListLine } from "../lib/examQuestionLayout";
import { QuestionNumpad } from "./QuestionNumpad";

export function ExamSessionShell(props: {
  studentName: string;
  paperMeta: PaperSessionMeta | null;
  currentQuestion: QuestionStudent;
  currentIndex: number;
  totalQuestions: number;
  maxReachableIndex: number;
  questionsAnswered: number;
  markedForReview: number[];
  skippedIndices: number[];
  isAdaptive: boolean;
  loadingIndex: number | null;
  timerSeconds: number | null;
  timerWarn: boolean;
  selected: string | null;
  isTita: boolean;
  optionsDisabled: boolean;
  canSubmit: boolean;
  submitting: boolean;
  ending: boolean;
  sectionTimingOut: boolean;
  onSelectQuestion: (index: number) => void;
  onClearResponse: () => void;
  onMarkReviewAndNext: () => void;
  onSkip: () => void;
  onSaveAndNext: () => void;
  onEndTest: () => void;
  onReport: () => void;
  onSelectOption: (key: string) => void;
  onTitaChange: (value: string) => void;
  reportModal: ReactNode;
}) {
  const {
    studentName,
    paperMeta,
    currentQuestion,
    currentIndex,
    totalQuestions,
    maxReachableIndex,
    questionsAnswered,
    markedForReview,
    skippedIndices,
    isAdaptive,
    loadingIndex,
    timerSeconds,
    timerWarn,
    selected,
    isTita,
    optionsDisabled,
    canSubmit,
    submitting,
    ending,
    sectionTimingOut,
    onSelectQuestion,
    onClearResponse,
    onMarkReviewAndNext,
    onSkip,
    onSaveAndNext,
    onEndTest,
    onReport,
    reportModal,
  } = props;

  const sectionTabs = paperMeta
    ? Array.from({ length: paperMeta.total_sections }, (_, i) => ({
        key: `sec-${i}`,
        label:
          i === paperMeta.section_index
            ? (paperMeta.section_title.length > 10 ? `${paperMeta.section_title.slice(0, 10)}…` : paperMeta.section_title)
            : `S${i + 1}`,
        active: i === paperMeta.section_index,
      }))
    : [
        {
          key: "practice",
          label: (currentQuestion.subject || "TEST").slice(0, 6).toUpperCase(),
          active: true,
        },
      ];

  const sectionBarTitle = paperMeta ? paperMeta.section_title : `${currentQuestion.subject} · ${currentQuestion.topic}`;
  const displayName = studentName.trim() || "Student";
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const questionParagraphs = formatQuestionParagraphs(currentQuestion.question_text);

  const paletteTitle = paperMeta
    ? paperMeta.section_title.length > 24
      ? `${paperMeta.section_title.slice(0, 24)}…`
      : paperMeta.section_title
    : "Questions";

  return (
    <div className="exam-shell">
      <header className="exam-top">
        <div className="exam-top__row">
          <div className="exam-section-tabs" role="tablist" aria-label="Sections">
            {sectionTabs.map((tab) => (
              <div
                key={tab.key}
                role="tab"
                aria-selected={tab.active}
                className={`exam-section-tab${tab.active ? " exam-section-tab--active" : ""}`}
              >
                {tab.label}
                <span className="exam-section-tab__info" title="Section information">
                  i
                </span>
              </div>
            ))}
          </div>
          <div className="exam-top__right">
            <div className="exam-profile">
              <div className="exam-profile__avatar" aria-hidden>
                {initials || "?"}
              </div>
              <span className="exam-profile__name">{displayName}</span>
            </div>
            <div className="exam-timer-block">
              <span className="exam-timer-block__label">Time Left :</span>
              <span className={`exam-timer-block__time${timerWarn ? " exam-timer-block__time--warn" : ""}`}>
                {timerSeconds != null ? formatExamTimer(timerSeconds) : "—"}
              </span>
            </div>
          </div>
        </div>
        <div className="exam-section-bar">
          <span className="exam-section-bar__label">Section</span>
          <div className="exam-section-bar__nav">
            <button type="button" className="exam-section-bar__arrow" disabled aria-label="Previous section">
              ‹
            </button>
            <span className="exam-section-bar__title" title={sectionBarTitle}>
              {sectionBarTitle}
              {isAdaptive ? (
                <span
                  className="exam-adaptive-badge"
                  title="Adaptive test: question difficulty adjusts based on your answers. Skipped questions cannot be revisited."
                >
                  Adaptive
                  <span className="exam-section-tab__info" aria-hidden>
                    i
                  </span>
                </span>
              ) : null}
            </span>
            <button type="button" className="exam-section-bar__arrow" disabled aria-label="Next section">
              ›
            </button>
          </div>
        </div>
      </header>

      <div className="exam-body">
        <div className="exam-main">
          {paperMeta ? (
            <div className="exam-marks-bar">
              Marks for correct answer <strong>{paperMeta.marks_per_correct}</strong> | Negative Marks{" "}
              <strong>{paperMeta.marks_per_incorrect}</strong>
            </div>
          ) : null}
          <div className="exam-question-panel">
            <p className="exam-question-panel__no">Question No. {currentIndex}</p>
            <p className="exam-question-panel__meta">
              {currentQuestion.subject} · {currentQuestion.topic}
            </p>
            {currentQuestion.image_url ? (
              <img src={currentQuestion.image_url} alt="" className="exam-question-panel__img" />
            ) : null}
            <div className="exam-question-panel__stem">
              {questionParagraphs.map((para, i) => (
                <p
                  key={i}
                  className={
                    isNumberedListLine(para)
                      ? "exam-question-panel__paragraph exam-question-panel__list-item"
                      : "exam-question-panel__paragraph"
                  }
                >
                  {para}
                </p>
              ))}
            </div>
            <div className="exam-options">
              {isTita ? (
                <input
                  type="text"
                  className="exam-tita-input"
                  autoComplete="off"
                  placeholder="Type your answer"
                  value={selected ?? ""}
                  disabled={optionsDisabled}
                  onChange={(e) => props.onTitaChange(e.target.value)}
                />
              ) : (
                currentQuestion.options.map((o) => (
                  <label key={o.key} className={`exam-option${selected === o.key ? " exam-option--selected" : ""}`}>
                    <input
                      type="radio"
                      name="opt"
                      checked={selected === o.key}
                      disabled={optionsDisabled}
                      onChange={() => props.onSelectOption(o.key)}
                    />
                    <span className="exam-option__label">{o.label}</span>
                  </label>
                ))
              )}
            </div>
            {!canSubmit ? (
              <p className="exam-review-note">Reviewing a submitted answer — only the active question can be changed.</p>
            ) : null}
          </div>
        </div>

        <aside className="exam-sidebar">
          <div className="exam-sidebar__inner">
            <QuestionNumpad
              variant="exam"
              sectionTitle={paletteTitle}
              totalQuestions={totalQuestions}
              currentIndex={currentIndex}
              maxReachableIndex={maxReachableIndex}
              questionsAnswered={questionsAnswered}
              markedForReview={markedForReview}
              skippedIndices={skippedIndices}
              loadingIndex={loadingIndex}
              onSelect={onSelectQuestion}
            />
          </div>
        </aside>
      </div>

      <footer className="exam-footer">
        <div className="exam-footer__main">
          <div className="exam-footer__left">
            <button
              type="button"
              className="exam-footer__btn"
              onClick={onMarkReviewAndNext}
              disabled={loadingIndex != null || sectionTimingOut || currentIndex >= maxReachableIndex}
            >
              Mark for Review &amp; Next
            </button>
            <button type="button" className="exam-footer__btn" onClick={onClearResponse} disabled={optionsDisabled || selected == null}>
              Clear Response
            </button>
            <button
              type="button"
              className="exam-footer__btn"
              onClick={onSkip}
              disabled={!canSubmit || loadingIndex != null || sectionTimingOut}
              title="Skip counts as unanswered (0 marks, no negative marking). You cannot return to a skipped question."
            >
              Skip
            </button>
            <button
              type="button"
              className="exam-footer__btn exam-footer__btn--primary"
              onClick={onSaveAndNext}
              disabled={
                submitting || !canSubmit || loadingIndex != null || sectionTimingOut || (isTita ? !selected?.trim() : selected == null)
              }
            >
              {submitting ? "Saving…" : "Save & Next"}
            </button>
            <button type="button" className="exam-footer__btn" onClick={onReport} disabled={loadingIndex != null || sectionTimingOut}>
              Report
            </button>
          </div>
        </div>
        <div className="exam-footer__sidebar">
          <button
            type="button"
            className="exam-submit-btn"
            onClick={onEndTest}
            disabled={submitting || ending || loadingIndex != null || sectionTimingOut}
          >
            {ending ? "Submitting…" : "Submit"}
          </button>
        </div>
      </footer>

      {reportModal}
    </div>
  );
}
