"""Lossless PNG row prediction for RGB PDF image streams; no resampling."""
import io
import hashlib
import struct

import fitz
from PIL import Image


def _idat(png):
    offset, chunks = 8, []
    while offset < len(png):
        length = struct.unpack('>I', png[offset:offset+4])[0]
        if png[offset+4:offset+8] == b'IDAT':
            chunks.append(png[offset+8:offset+8+length])
        offset += length + 12
    return b''.join(chunks)


def optimize_rgb_images(document, originals=()):
    # Reuse already-compressed PNG data when its decoded pixels match exactly.
    references = {}
    for path in originals:
        png = path.read_bytes()
        if not png.startswith(b'\x89PNG\r\n\x1a\n') or png[24:26] != bytes((8, 2)) or png[28] != 0:
            continue
        with Image.open(path) as image:
            key = (image.width, image.height, hashlib.sha256(image.tobytes()).digest())
        references[key] = path
    saved = 0
    for xref in range(1, document.xref_length()):
        if (document.xref_get_key(xref, 'Subtype')[1] != '/Image'
                or document.xref_get_key(xref, 'Filter')[1] not in ('/FlateDecode', 'null')
                or document.xref_get_key(xref, 'BitsPerComponent')[1] != '8'
                or document.xref_get_key(xref, 'Decode')[0] != 'null'):
            continue
        pix = fitz.Pixmap(document, xref)
        if pix.n != 3 or pix.alpha or pix.colorspace.n != 3:
            continue
        original = pix.samples
        match = references.get((pix.width, pix.height, hashlib.sha256(original).digest()))
        if match:
            encoded = _idat(match.read_bytes())
        else:
            buffer = io.BytesIO()
            Image.frombytes('RGB', (pix.width, pix.height), original).save(
                buffer, format='PNG', compress_level=3)
            encoded = _idat(buffer.getvalue())
        old_size = len(document.xref_stream_raw(xref))
        if len(encoded) >= old_size:
            continue
        document.update_stream(xref, encoded, compress=False)
        document.xref_set_key(xref, 'Filter', '/FlateDecode')
        document.xref_set_key(xref, 'DecodeParms',
            f'<< /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns {pix.width} >>')
        # Guard the print invariant: every decoded channel value stays identical.
        if fitz.Pixmap(document, xref).samples != original:
            raise ValueError('Lossless PDF image verification failed')
        saved += old_size - len(encoded)
    return saved
