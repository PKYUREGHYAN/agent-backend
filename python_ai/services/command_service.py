"""Fast Armenian command matches with a Qwen fallback for contextual requests."""

import re

from services.ollama_service import ask_json


_ALLOWED_COMMANDS = {
    "BEAUTIFY_HOUSE",
    "IMPROVE_LIGHTING",
    "REPAIR_WALLS",
    "REMOVE_CLOTHES",
    "REMOVE_BOTTLES",
    "REMOVE_TRASH",
    "REMOVE_TABLE_CLUTTER",
    "REMOVE_PEOPLE",
    "REMOVE_FURNITURE",
    "UPSCALE_IMAGE",
    "UNKNOWN",
}

_COMMANDS = (
    ("REMOVE_PEOPLE", ("մարդ", "people", "person", "human")),
    ("REMOVE_CLOTHES", ("հագուստ", "շոր", "clothes", "clothing")),
    ("REMOVE_BOTTLES", ("շիշ", "շշեր", "bottle", "bottles")),
    ("REMOVE_TRASH", ("աղբ", "թափոն", "trash", "garbage", "rubbish")),
    ("REMOVE_TABLE_CLUTTER", ("սեղանի վրայի իր", "սեղանը մաքր", "table clutter", "clear the table")),
    ("REMOVE_FURNITURE", ("կահույք", "աթոռ", "բազմոց", "furniture", "chair", "sofa")),
    ("IMPROVE_LIGHTING", ("լուսավոր", "լուսավորություն", "մութ", "lighting", "brighter", "brighten", "darken")),
    ("REPAIR_WALLS", ("պատ", "wall", "crack", "hole in the wall")),
    ("UPSCALE_IMAGE", ("մեծացր", "բարձր լուծաչափ", "upscale", "increase resolution", "enhance resolution")),
    ("BEAUTIFY_HOUSE", ("գեղեցկ", "թարմացր", "beautify", "improve the house")),
)
_PRESERVATION_CUES = (
    "keep", "preserve", "leave", "retain", "maintain", "do not", "don't",
    "պահել", "պահպան", "չհեռացնել", "չհանել", "չփոխել",
)


def _matches(text: str, keyword: str) -> bool:
    if any(not character.isascii() for character in keyword):
        return keyword in text
    return re.search(rf"(?<!\w){re.escape(keyword)}(?!\w)", text) is not None


def understand_command(text: str) -> dict:
    normalized = re.sub(r"\s+", " ", text.casefold()).strip()
    matched = [
        command for command, keywords in _COMMANDS
        if any(_matches(normalized, keyword) for keyword in keywords)
    ]
    needs_context = any(cue in normalized for cue in _PRESERVATION_CUES)

    if len(matched) == 1 and not needs_context:
        command = matched[0]
        return {
            "command": command,
            "instruction": f"Կատարել {command} գործողությունը ընտրված նկարի վրա",
            "engine": "local-rule-parser",
            "confidence": 1.0,
        }

    prompt = (
        "You route one instruction for a real-estate photo editor. Understand Armenian and English. "
        "Choose exactly one command from BEAUTIFY_HOUSE, IMPROVE_LIGHTING, REPAIR_WALLS, "
        "REMOVE_CLOTHES, REMOVE_BOTTLES, REMOVE_TRASH, REMOVE_TABLE_CLUTTER, REMOVE_PEOPLE, "
        "REMOVE_FURNITURE, UPSCALE_IMAGE, UNKNOWN. Respect explicit keep/preserve/do-not-change "
        "constraints. Choose UNKNOWN for multiple incompatible edits or unclear targets. "
        "Return JSON only: command, confidence (0..1), instruction."
    )
    result = ask_json(prompt, text, timeout=60.0)
    if result:
        command = str(result.get("command", "UNKNOWN")).upper()
        try:
            confidence = float(result.get("confidence", 0))
        except (TypeError, ValueError):
            confidence = 0.0
        if command in _ALLOWED_COMMANDS and confidence >= 0.70:
            return {
                "command": command,
                "instruction": str(result.get("instruction", ""))[:240],
                "engine": "qwen3-vl:4b-instruct",
                "confidence": min(confidence, 1.0),
            }

    return {
        "command": "UNKNOWN",
        "instruction": "Հրահանգը հստակ չհասկացվեց։ Նկարը չի փոփոխվել։",
        "engine": "qwen3-vl-unavailable" if result is None else "qwen3-vl:4b-instruct",
        "confidence": 0.0,
    }
