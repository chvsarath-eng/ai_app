from __future__ import annotations

import os
from pathlib import Path

from imggen import _encode_image_to_data_uri


def _env_int(key: str, default: int) -> int:
  val = os.getenv(key, '').strip()
  if not val:
    return default
  try:
    n = int(val)
    return n if n > 0 else default
  except Exception:
    return default


def _b64_chars_for_file(path: Path, *, max_side_px: int, target_bytes: int) -> int:
  data_uri = _encode_image_to_data_uri(path, max_side_px=max_side_px, target_bytes=target_bytes)
  _header, b64_data = data_uri.split(',', 1)
  return len(b64_data)


def main() -> None:
  repo_dir = Path(__file__).resolve().parent
  default_img = repo_dir / 'output.png'
  image_path = Path(os.getenv('REF_IMAGE') or default_img)
  if not image_path.is_absolute():
    image_path = (repo_dir / image_path).resolve()
  if not image_path.exists():
    raise SystemExit(f'Reference image not found: {image_path}')

  max_side_px = _env_int('IMAGE_REF_MAX_SIDE_PX', 1536)
  target_bytes = _env_int('IMAGE_REF_TARGET_BYTES', 900_000)
  max_total_b64 = _env_int('IMAGE_REF_MAX_TOTAL_B64_CHARS', 14_000_000)
  chars = _b64_chars_for_file(image_path, max_side_px=max_side_px, target_bytes=target_bytes)

  # Rough estimate: base64 chars ~= bytes transmitted for the inlineData.data field.
  # Multiply by N references to estimate request contribution for multi-character scenes.
  for n in (1, 2, 3, 4):
    est = chars * n
    status = 'OK' if est <= max_total_b64 else 'TOO_LARGE'
    print(f'{n} refs: est_b64_chars={est:,} (per_ref={chars:,}) limit={max_total_b64:,} => {status}')


if __name__ == '__main__':
  main()

