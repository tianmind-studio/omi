"""Regression tests for UTF-8 stdin handling in ``omi conversation create``.

On Windows, sys.stdin.read() decodes using the process's locale encoding (often
cp1252), which mangles UTF-8 bytes from a pipe. These tests verify that:

1. UTF-8 encoded stdin is correctly decoded regardless of locale.
2. Invalid UTF-8 bytes produce a clear UsageError, not a silently corrupted request.

Ref: upstream issue #13170
"""

from __future__ import annotations

import io
import json
import sys

import pytest

from omi_cli.main import main


class FakeStdin:
    """A minimal stdin mock with a binary buffer and isatty() returning False."""

    def __init__(self, data: bytes) -> None:
        self.buffer = io.BytesIO(data)

    def isatty(self) -> bool:
        return False

    def read(self) -> str:
        # Should not be called if the fix is correct
        raise AssertionError("sys.stdin.read() should not be called; use stdin.buffer.read()")


def test_conversation_create_stdin_preserves_utf8(authed_profile, respx_mock, monkeypatch, capsys) -> None:
    """UTF-8 text piped via --text - arrives at the API unchanged."""
    route = respx_mock.post("/v1/dev/user/conversations").respond(
        json={"id": "c1", "status": "completed", "discarded": False}
    )
    # Simulate piped UTF-8 input: "Café, 日本語 🙂"
    utf8_text = "Café, 日本語 🙂"
    utf8_bytes = utf8_text.encode("utf-8")

    monkeypatch.setattr(sys, "stdin", FakeStdin(utf8_bytes))
    monkeypatch.setattr(sys, "argv", ["omi", "--json", "conversation", "create", "--text", "-", "--language", "fr"])

    # main() returns normally on success (no SystemExit for exit code 0)
    main()

    body = json.loads(route.calls.last.request.content)
    assert body["text"] == utf8_text
    assert body["language"] == "fr"


def test_conversation_create_stdin_rejects_invalid_utf8(authed_profile, respx_mock, monkeypatch, capsys) -> None:
    """Invalid UTF-8 bytes produce a clear error before any HTTP request."""
    # 0xFF is not valid in any UTF-8 sequence
    invalid_bytes = b"caf\xff"

    monkeypatch.setattr(sys, "stdin", FakeStdin(invalid_bytes))
    monkeypatch.setattr(sys, "argv", ["omi", "--json", "conversation", "create", "--text", "-"])

    with pytest.raises(SystemExit) as exc:
        main()

    assert exc.value.code == 1
    output = capsys.readouterr()
    err = json.loads(output.err)
    assert "not valid UTF-8" in err["error"]
    # No HTTP call should have been made
    assert not respx_mock.calls


def test_conversation_create_stdin_handles_bom(authed_profile, respx_mock, monkeypatch, capsys) -> None:
    """UTF-8 with BOM is handled (BOM becomes part of text, as expected for raw read)."""
    route = respx_mock.post("/v1/dev/user/conversations").respond(
        json={"id": "c1", "status": "completed", "discarded": False}
    )
    # UTF-8 BOM + text
    text_with_bom = "\ufeffHello"
    utf8_bytes = text_with_bom.encode("utf-8")

    monkeypatch.setattr(sys, "stdin", FakeStdin(utf8_bytes))
    monkeypatch.setattr(sys, "argv", ["omi", "--json", "conversation", "create", "--text", "-"])

    main()

    body = json.loads(route.calls.last.request.content)
    # BOM is preserved (user can strip if needed; we don't silently modify)
    assert body["text"] == text_with_bom


@pytest.mark.parametrize("text", [
    "Simple ASCII",
    "Café résumé",
    "日本語テスト",
    "Привет мир",
    "🎉🚀💻",
    "Mixed: café 日本語 🙂",
])
def test_conversation_create_stdin_various_unicode(
    authed_profile, respx_mock, monkeypatch, capsys, text
) -> None:
    """Various Unicode text is preserved through the stdin path."""
    route = respx_mock.post("/v1/dev/user/conversations").respond(
        json={"id": "c1", "status": "completed", "discarded": False}
    )
    utf8_bytes = text.encode("utf-8")

    monkeypatch.setattr(sys, "stdin", FakeStdin(utf8_bytes))
    monkeypatch.setattr(sys, "argv", ["omi", "--json", "conversation", "create", "--text", "-"])

    main()

    body = json.loads(route.calls.last.request.content)
    assert body["text"] == text
