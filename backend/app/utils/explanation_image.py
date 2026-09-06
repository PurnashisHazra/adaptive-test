import re
from typing import Optional, Tuple

_MARKER_RE = re.compile(r"<!--adaptest-exp-img:(.*?)-->", re.DOTALL)


def split_explanation_image(
    explanation: Optional[str],
    explicit_url: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """Return (clean explanation text, image URL).

    The URL may come from ``explicit_url`` or an embedded ``<!--adaptest-exp-img:...-->``
    marker so the image is retained even if a dedicated field is dropped.
    """
    raw = (explanation or "").strip()
    found = ""
    if raw:
        matches = _MARKER_RE.findall(raw)
        if matches:
            found = str(matches[-1]).strip()
        raw = _MARKER_RE.sub("", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw).strip()
    url = (explicit_url or "").strip() or found or None
    return (raw or None), url


def embed_explanation_image(explanation: Optional[str], image_url: Optional[str]) -> Optional[str]:
    text, _ = split_explanation_image(explanation, None)
    url = (image_url or "").strip()
    if not url:
        return text
    marker = f"<!--adaptest-exp-img:{url}-->"
    return f"{text}\n\n{marker}" if text else marker
