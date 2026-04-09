from enum import Enum


class Difficulty(str, Enum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"
    EXPERT = "EXPERT"


class QuestionType(str, Enum):
    MCQ_SINGLE = "mcq_single"
    TRUE_FALSE = "true_false"
    TITA = "tita"  # Type In The Answer — free text, matched case-insensitively (trimmed)


class AttemptStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


DIFFICULTY_ORDER = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD, Difficulty.EXPERT]
