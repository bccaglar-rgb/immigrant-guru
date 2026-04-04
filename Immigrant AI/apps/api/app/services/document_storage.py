from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import Settings


@dataclass(frozen=True)
class StoredDocument:
    filename: str
    size: int
    storage_path: str


class DocumentStorageError(RuntimeError):
    """Raised when file storage fails."""


class LocalDocumentStorage:
    """Local filesystem storage abstraction designed for later S3 replacement."""

    def __init__(self, settings: Settings) -> None:
        self._root = Path(settings.local_storage_root).expanduser().resolve()

    async def save_case_file(
        self,
        *,
        case_id: str,
        upload_file: UploadFile,
    ) -> StoredDocument:
        original_name = Path(upload_file.filename or "").name
        generated_name = f"{uuid4().hex}_{original_name or 'document'}"
        relative_path = Path("documents") / case_id / generated_name
        absolute_path = self._root / relative_path
        absolute_path.parent.mkdir(parents=True, exist_ok=True)

        size = 0

        try:
            with absolute_path.open("wb") as destination:
                while True:
                    chunk = await upload_file.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    destination.write(chunk)
        except OSError as exc:
            raise DocumentStorageError("Failed to persist uploaded document.") from exc
        finally:
            await upload_file.close()

        if size == 0:
            try:
                absolute_path.unlink(missing_ok=True)
            except OSError:
                pass
            raise DocumentStorageError("Uploaded document was empty.")

        return StoredDocument(
            filename=absolute_path.name,
            size=size,
            storage_path=relative_path.as_posix(),
        )

    def delete(self, storage_path: str) -> None:
        absolute_path = (self._root / storage_path).resolve()

        try:
            absolute_path.relative_to(self._root)
        except ValueError as exc:
            raise DocumentStorageError("Invalid document storage path.") from exc

        try:
            absolute_path.unlink(missing_ok=True)
        except OSError as exc:
            raise DocumentStorageError("Failed to remove stored document.") from exc
