#!/usr/bin/env python3
"""Generate game sprite assets via OpenRouter image models.

Outputs are saved to scripts/output/ with unique timestamped names.
Each generation produces two files:
  - <prefix>_<timestamp>.png   — the generated image
  - <prefix>_<timestamp>.txt   — the prompt used
"""

import argparse
import base64
import io
import json
import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, request

try:
    from PIL import Image
    import numpy as np

    HAS_PIL = True
except ImportError:
    HAS_PIL = False


DEFAULT_MODEL = "google/gemini-3.1-flash-image-preview"
DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
OUTPUT_DIR = Path(__file__).resolve().parent / "output"
DEFAULT_PREFIX = "asset"


def load_dotenv(dotenv_path: Path) -> None:
    if not dotenv_path.exists():
        return

    for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'").strip('"'))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate an image via OpenRouter from a prompt, with an optional base image."
    )
    parser.add_argument(
        "--prompt",
        required=True,
        help="Prompt to send to the model.",
    )
    parser.add_argument(
        "--input",
        help="Optional path to a base/reference image.",
    )
    parser.add_argument(
        "--prefix",
        default=DEFAULT_PREFIX,
        help=f"Filename prefix for output files. Default: {DEFAULT_PREFIX}",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=(
            "OpenRouter model to use. Must support image input plus image/text output. "
            f"Default: {DEFAULT_MODEL}"
        ),
    )
    parser.add_argument(
        "--quality",
        default="high",
        choices=["low", "medium", "high", "auto"],
        help="Prompt-level quality hint. Default: high",
    )
    parser.add_argument(
        "--input-fidelity",
        default="high",
        choices=["low", "medium", "high"],
        help="Prompt-level preservation hint for the reference image. Default: high",
    )
    parser.add_argument(
        "--aspect-ratio",
        default="4:1",
        help="OpenRouter image_config.aspect_ratio value. Default: 4:1",
    )
    parser.add_argument(
        "--image-size",
        default="auto",
        help=(
            "OpenRouter image_config.image_size value. Use auto to pick 0.5K for the "
            f"default Gemini model and omit it for other models. Default: auto"
        ),
    )
    parser.add_argument(
        "--api-url",
        default=DEFAULT_ENDPOINT,
        help=f"OpenRouter endpoint. Default: {DEFAULT_ENDPOINT}",
    )
    parser.add_argument(
        "--resize",
        help="Resize final image to WxH (e.g. 512x128). Applied after background removal.",
    )
    parser.add_argument(
        "--no-remove-bg",
        action="store_true",
        help="Skip automatic checkered-background removal.",
    )
    return parser.parse_args()


def build_prompt(base_prompt: str, quality: str, input_fidelity: str) -> str:
    quality_note = {
        "low": "Model guidance: prioritize speed and a usable draft sprite sheet over polish.",
        "medium": "Model guidance: balance output speed with stable sprite-sheet readability.",
        "high": "Model guidance: prioritize final asset polish, clean edges, and sheet consistency.",
        "auto": "Model guidance: choose a balanced level of finish while keeping the layout exact.",
    }[quality]

    fidelity_note = {
        "low": "Reference preservation: similarity to the input can be loose as long as the character stays recognizable.",
        "medium": "Reference preservation: keep the character clearly consistent with the input image.",
        "high": "Reference preservation: preserve the input character identity, proportions, and facial details very closely.",
    }[input_fidelity]

    return f"{base_prompt}\n\nAdditional model guidance:\n- {quality_note}\n- {fidelity_note}\n"


def detect_mime_type(path: Path) -> str:
    mime_type, _ = mimetypes.guess_type(path.name)
    return mime_type or "image/png"


def encode_image_as_data_url(path: Path) -> str:
    mime_type = detect_mime_type(path)
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def choose_image_size(model: str, requested: str) -> str | None:
    if requested != "auto":
        return requested
    if model == DEFAULT_MODEL:
        return "0.5K"
    return None


def build_payload(args: argparse.Namespace, data_url: str | None) -> dict:
    content = [
        {
            "type": "text",
            "text": build_prompt(args.prompt, args.quality, args.input_fidelity),
        }
    ]
    if data_url:
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": data_url,
                },
            }
        )

    payload = {
        "model": args.model,
        "messages": [
            {
                "role": "user",
                "content": content,
            }
        ],
        "modalities": ["image", "text"],
        "stream": False,
        "image_config": {
            "aspect_ratio": args.aspect_ratio,
        },
    }

    # Disabled for debugging provider-side INVALID_ARGUMENT errors from Google AI Studio.
    # image_size = choose_image_size(args.model, args.image_size)
    # if image_size:
    #     payload["image_config"]["image_size"] = image_size

    return payload


def build_headers() -> dict:
    api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OR_API_KEY")
    if not api_key:
        raise SystemExit(
            "Missing OPENROUTER_API_KEY. Add it to your environment or .env before running this script."
        )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    site_url = os.getenv("OPENROUTER_SITE_URL") or os.getenv("OR_SITE_URL")
    app_name = os.getenv("OPENROUTER_APP_NAME") or os.getenv("OR_APP_NAME")

    if site_url:
        headers["HTTP-Referer"] = site_url
    if app_name:
        headers["X-Title"] = app_name

    return headers


def post_json(url: str, payload: dict, headers: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    http_request = request.Request(url, data=body, headers=headers, method="POST")

    try:
        with request.urlopen(http_request) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"OpenRouter request failed ({exc.code}): {details}") from exc
    except error.URLError as exc:
        raise SystemExit(f"OpenRouter request failed: {exc.reason}") from exc


def extract_first_image_data_url(result: dict) -> str:
    choices = result.get("choices") or []
    if not choices:
        raise SystemExit(f"No choices returned by OpenRouter: {json.dumps(result, indent=2)}")

    message = choices[0].get("message") or {}
    images = message.get("images") or []
    if not images:
        content = message.get("content")
        raise SystemExit(
            "OpenRouter returned no images. "
            "Make sure the model supports image input and image output, and that it can "
            f"use modalities ['image', 'text'].\nResponse content: {content}"
        )

    first_image = images[0]
    image_info = first_image.get("image_url") or first_image.get("imageUrl") or {}
    data_url = image_info.get("url")
    if not data_url:
        raise SystemExit(f"Image response missing data URL: {json.dumps(first_image, indent=2)}")

    return data_url


def parse_data_url(data_url: str) -> tuple[bytes, str]:
    """Decode a base64 data URL and return (image_bytes, file_extension)."""
    prefix = ";base64,"
    if prefix not in data_url:
        raise SystemExit("Expected a base64 data URL in the OpenRouter image response.")

    header, b64_data = data_url.split(prefix, 1)
    image_bytes = base64.b64decode(b64_data)

    # Extract MIME type from data:image/png;base64,... header
    mime_to_ext = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }
    mime_type = header.replace("data:", "").strip()
    ext = mime_to_ext.get(mime_type, ".png")

    return image_bytes, ext


def remove_checkered_background(image_bytes: bytes) -> Image.Image:
    """Remove the gray checkered background that AI models render instead of transparency."""
    if not HAS_PIL:
        raise SystemExit(
            "Pillow and numpy are required for background removal. "
            "Install them with: pip install Pillow numpy"
        )

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    arr = np.array(img)
    r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)

    # Checkered backgrounds alternate between ~78 and ~140 gray
    is_gray = (np.abs(r - g) < 20) & (np.abs(g - b) < 20)
    is_checker_range = (r > 50) & (r < 170)
    is_bg = is_gray & is_checker_range

    rgba = np.zeros((*arr.shape[:2], 4), dtype=np.uint8)
    rgba[:, :, :3] = arr
    rgba[:, :, 3] = np.where(is_bg, 0, 255)

    return Image.fromarray(rgba, "RGBA")


def generate_unique_name(prefix: str) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"{prefix}_{timestamp}"


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    load_dotenv(root / ".env")
    args = parse_args()

    data_url = None
    if args.input:
        input_path = Path(args.input).expanduser().resolve()
        if not input_path.exists():
            raise SystemExit(f"Input image not found: {input_path}")
        data_url = encode_image_as_data_url(input_path)

    payload = build_payload(args, data_url)
    headers = build_headers()
    result = post_json(args.api_url, payload, headers)

    image_data_url = extract_first_image_data_url(result)
    image_bytes, ext = parse_data_url(image_data_url)

    # Write output files with unique names
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    unique_name = generate_unique_name(args.prefix)

    # Save raw output
    raw_path = OUTPUT_DIR / f"{unique_name}_raw{ext}"
    raw_path.write_bytes(image_bytes)
    print(f"Saved raw:    {raw_path}")

    # Post-process: remove checkered background and resize
    if not args.no_remove_bg and HAS_PIL:
        img = remove_checkered_background(image_bytes)
        if args.resize:
            w, h = (int(x) for x in args.resize.lower().split("x"))
            img = img.resize((w, h), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        image_bytes = buf.getvalue()
        ext = ".png"

    image_path = OUTPUT_DIR / f"{unique_name}{ext}"
    prompt_path = OUTPUT_DIR / f"{unique_name}.txt"
    image_path.write_bytes(image_bytes)

    full_prompt = build_prompt(args.prompt, args.quality, args.input_fidelity)
    prompt_path.write_text(
        f"Model: {args.model}\n"
        f"Aspect ratio: {args.aspect_ratio}\n"
        f"Quality: {args.quality}\n"
        f"Input fidelity: {args.input_fidelity}\n"
        f"Input image: {args.input or 'none'}\n"
        f"\n--- Prompt ---\n\n{full_prompt}",
        encoding="utf-8",
    )

    print(f"Saved image:  {image_path}")
    print(f"Saved prompt: {prompt_path}")


if __name__ == "__main__":
    main()
